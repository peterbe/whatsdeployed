#!/usr/bin/env python
import json
import time
import os
import urllib
import cgi
import random
from urllib.parse import urlparse
from collections import defaultdict

import requests
from flask import (
    Flask,
    request,
    make_response,
    jsonify,
    send_file,
    abort,
    redirect,
)
from flask.views import MethodView
from flask_sqlalchemy import SQLAlchemy


DEBUG = os.environ.get('DEBUG', False) in ('true', '1', 'on')

DEFAULT_REQUEST_HEADERS = {
    'User-Agent': 'whatsdeployed',
}

GITHUB_REQUEST_HEADERS = {
    'User-Agent': 'whatsdeployed (https://whatsdeployed.io)',
}
GITHUB_AUTH_TOKEN = os.environ.get('GITHUB_AUTH_TOKEN')
if GITHUB_AUTH_TOKEN:
    GITHUB_REQUEST_HEADERS['Authorization'] = (
        'token {}'.format(GITHUB_AUTH_TOKEN)
    )

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get(
    'SQLALCHEMY_DATABASE_URI',
    'postgres://localhost/whatsdeployed'
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = DEBUG
db = SQLAlchemy(app)


class Shortlink(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    link = db.Column(db.String(80), unique=True)
    owner = db.Column(db.String(200))
    repo = db.Column(db.String(200))
    revisions = db.Column(db.Text)

    def __init__(self, link, owner, repo, revisions):
        self.link = link
        self.owner = owner
        self.repo = repo
        assert isinstance(revisions, list), type(revisions)
        self.revisions = json.dumps(revisions)

    def __repr__(self):
        return '<Shortlink %r>' % self.link


@app.route('/')
def index_html():
    return send_file('index.html')


class ShasView(MethodView):

    def post(self):
        deployments = []
        for each in request.json:
            name = each['name']
            url = each['url']
            content = self.fetch_content(url)
            if not 7 <= len(content) <= 40:
                # doesn't appear to be a git sha
                error = (
                    "Doesn't look like a sha\n (%s) on %s" %
                    (content, each['url'])
                )
                return make_response(jsonify({'error': error}))
            deployments.append({
                'name': name,
                'sha': content,
                'bugs': []
            })
        response = make_response(jsonify({'deployments': deployments}))
        return response

    def fetch_content(self, url):
        if '?' in url:
            url += '&'
        else:
            url += '?'
        url += 'cachescramble=%s' % time.time()
        r = requests.get(
            url,
            headers=DEFAULT_REQUEST_HEADERS,
            timeout=30,
        )
        r.raise_for_status()
        return r.text.strip()


class CulpritsView(MethodView):

    def post(self):
        groups = []
        deployments = request.json['deployments']
        base_url = 'https://api.github.com/repos/{owner}/{repo}'.format(
            repo=request.json['repo'],
            owner=request.json['owner']
        )
        pulls_url = base_url + (
            '/pulls?sort=created&state=closed&direction=desc'
        )
        _looked_up = []
        for deployment in deployments:
            name = deployment['name']
            sha = deployment['sha']
            if sha in _looked_up:
                # If you have, for example Stage on the exact same
                # sha as Prod, then there's no going looking it up
                # twice.
                continue

            users = []
            links = []
            r = requests.get(
                pulls_url,
                headers=DEFAULT_REQUEST_HEADERS,
                timeout=30,
            )
            assert r.status_code == 200, r.status_code
            for pr in r.json():
                if pr['merge_commit_sha'] == sha:
                    links.append(pr['_links']['html']['href'])
                    author = pr['user']
                    users.append((
                        'Author',
                        author,
                    ))
                    committer = pr.get('committer')
                    if committer and committer != author:
                        users.append((
                            'Committer',
                            committer
                        ))
                    # let's also dig into what other people participated
                    for assignee in pr['assignees']:
                        users.append((
                            'Assignee',
                            assignee
                        ))
                    # Other people who commented on the PR
                    issues_url = base_url + (
                        '/issues/{number}/comments'.format(
                            number=pr['number']
                        )
                    )
                    r = requests.get(
                        issues_url,
                        headers=DEFAULT_REQUEST_HEADERS,
                        timeout=30,
                    )
                    assert r.status_code == 200, r.status_code
                    for comment in r.json():
                        try:
                            user = comment['user']
                            users.append((
                                'Commenter',
                                user
                            ))
                        except TypeError:
                            print("COMMENT")
                            print(comment)
                    break

            commits_url = base_url + (
                '/commits/{sha}'.format(sha=sha)
            )
            r = requests.get(
                commits_url,
                headers=DEFAULT_REQUEST_HEADERS,
                timeout=30,
            )
            assert r.status_code == 200, r.status_code
            commit = r.json()

            author = commit['author']
            if ('Author', author) not in users:
                users.append((
                    'Author',
                    author
                ))
            committer = commit.get('committer')
            if committer:
                if committer['login'] == 'web-flow':
                    # Then the author pressed the green button and let
                    # GitHub merge it.
                    # Change the label of the author to also be the committer
                    users.append(('Committer', author))
                elif committer != author:
                    users.append((
                        'Committer',
                        committer
                    ))
            # Now merge the labels for user
            labels = defaultdict(list)
            for label, user in users:
                if label not in labels[user['login']]:
                    labels[user['login']].append(label)
            labels_map = {}
            for login, labels in labels.items():
                labels_map[login] = ' & '.join(labels)
            unique_users = []
            _logins = set()
            for _, user in users:
                if user['login'] not in _logins:
                    _logins.add(user['login'])
                    unique_users.append((
                        labels_map[user['login']],
                        user
                    ))
            groups.append({
                'name': name,
                'users': unique_users,
                'links': links,
            })
            _looked_up.append(sha)

        response = make_response(jsonify({'culprits': groups}))
        return response


class ShortenView(MethodView):

    def post(self):
        url = request.form['url']
        qs = urlparse(url).query
        parsed = cgi.parse_qs(qs)
        owner = parsed['owner'][0]
        repo = parsed['repo'][0]
        revisions = []
        for i, name in enumerate(parsed['name[]']):
            revisions.append((name, parsed['url[]'][i]))
        # Does it already exist??
        shortlink = Shortlink.query.filter_by(
            owner=owner,
            repo=repo,
            revisions=json.dumps(revisions)
        ).first()

        if shortlink is not None:
            link = shortlink.link
        else:
            def new_random_link(length):
                pool = 'abcdefghijklmnopqrstuvwxyz0123456789'
                pool += pool.upper()
                new = ''
                while len(new) < length:
                    new += random.choice(list(pool))
                return new

            link = new_random_link(3)
            while Shortlink.query.filter_by(link=link).count():
                link = new_random_link(3)
            shortlink = Shortlink(
                link,
                owner,
                repo,
                revisions
            )
            db.session.add(shortlink)
            db.session.commit()

        new_url = '/s-{}'.format(link)
        return make_response(jsonify({'url': new_url}))


class ShortlinkRedirectView(MethodView):

    def get(self, link):
        shortlink = Shortlink.query.filter_by(link=link).first()
        if shortlink is None:
            abort(404)
        qs = {
            'repo': shortlink.repo,
            'owner': shortlink.owner,
            'name[]': [],
            'url[]': []
        }
        for k, v in json.loads(shortlink.revisions):
            qs['name[]'].append(k)
            qs['url[]'].append(v)
        return redirect('/?' + urllib.urlencode(qs, True))


app.add_url_rule('/shas', view_func=ShasView.as_view('shas'))
app.add_url_rule('/culprits', view_func=CulpritsView.as_view('culprits'))
app.add_url_rule('/shortenit', view_func=ShortenView.as_view('shortenit'))
app.add_url_rule(
    '/s-<string:link>', view_func=ShortlinkRedirectView.as_view('shortlink')
)


if __name__ == '__main__':
    db.create_all()

    app.debug = DEBUG
    port = int(os.environ.get('PORT', 5000))
    host = os.environ.get('HOST', '0.0.0.0')
    app.run(host=host, port=port)
