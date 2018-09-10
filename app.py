#!/usr/bin/env python
import json
import time
import os
import cgi
import random
import warnings
from urllib.parse import urlparse, urlencode
from collections import defaultdict

import requests
from requests.exceptions import ReadTimeout
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
from decouple import config


DEBUG = config('DEBUG', default=False)
GITHUB_REQUEST_TIMEOUT = config('GITHUB_REQUEST_TIMEOUT', default=10)
GITHUB_REQUEST_HEADERS = {
    'User-Agent': config(
        'REQUESTS_USER_AGENT',
        default='whatsdeployed (https://whatsdeployed.io)'
    ),
}
GITHUB_AUTH_TOKEN = config('GITHUB_AUTH_TOKEN', default=None)
if GITHUB_AUTH_TOKEN:
    GITHUB_REQUEST_HEADERS['Authorization'] = (
        'token {}'.format(GITHUB_AUTH_TOKEN)
    )
else:
    warnings.warn(
        "GITHUB_AUTH_TOKEN is NOT available. Worry about rate limits."
    )

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = config(
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


def extract_sha(content):
    content = content.strip()

    if content.startswith('{') and content.endswith('}'):
        # If it starts and ends with curly braces, it just might be a json
        # object
        try:
            data = json.loads(content)

            # This is where it's at in Dockerflow-supported sites
            if 'commit' in data:
                return data['commit']

        except json.decoder.JSONDecodeError:
            pass

    if 7 <= len(content) <= 40:
        return content


class ShasView(MethodView):

    def post(self):
        deployments = []
        environment = request.json

        base_url = 'https://api.github.com/repos/{owner}/{repo}'.format(
            repo=environment['repo'],
            owner=environment['owner']
        )
        tags_url = base_url + (
            '/tags?sort=created&direction=desc'
        )

        tags = {}
        while True:
            try:
                r = requests.get(
                    tags_url,
                    headers=GITHUB_REQUEST_HEADERS,
                    timeout=GITHUB_REQUEST_TIMEOUT,
                )
                r.raise_for_status()
                for tag in r.json():
                    tags[tag['commit']['sha']] = tag['name']
                try:
                    tags_url = r.links['next']['url']
                except KeyError:
                    break
            except ReadTimeout:
                break

        for each in environment['deployments']:
            name = each['name']
            url = each['url']

            # Skip empty urls
            if not url:
                continue

            # Fetch the sha and balk if it doesn't exist
            try:
                response = self.fetch_content(url)
                if response.status_code != 200:
                    return make_response(jsonify({
                        'error': '{} trying to load {}'.format(
                            response.status_code,
                            url,
                        )
                    }))
            except ReadTimeout:
                return make_response(jsonify({
                    'error': 'Timeout error trying to load {}'.format(
                        url,
                    )
                }))
            content = response.text.strip()
            sha = extract_sha(content)
            if not sha:
                # doesn't appear to be a git sha
                error = (
                    "Doesn't look like a sha\n (%s) on %s" %
                    (content, each['url'])
                )
                return make_response(jsonify({'error': error}))

            deployments.append({
                'name': name,
                'sha': sha,
                'bugs': [],
                'url': url,
            })

        response = make_response(jsonify({
            'deployments': deployments,
            'tags': tags,
        }))
        return response

    def fetch_content(self, url):
        if '?' in url:
            url += '&'
        else:
            url += '?'
        url += 'cachescramble=%s' % time.time()
        return requests.get(
            url,
            headers=GITHUB_REQUEST_HEADERS,
            timeout=GITHUB_REQUEST_TIMEOUT,
        )


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
            try:
                r = requests.get(
                    pulls_url,
                    headers=GITHUB_REQUEST_HEADERS,
                    timeout=GITHUB_REQUEST_TIMEOUT,
                )
                r.raise_for_status()
            except ReadTimeout:
                return make_response(jsonify({
                    'error': 'Timeout error trying to load {}'.format(
                        pulls_url,
                    )
                }))

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
                        headers=GITHUB_REQUEST_HEADERS,
                        timeout=GITHUB_REQUEST_TIMEOUT,
                    )
                    r.raise_for_status()
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
                headers=GITHUB_REQUEST_HEADERS,
                timeout=GITHUB_REQUEST_TIMEOUT,
            )
            r.raise_for_status()
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


class ShortenedView(MethodView):

    def get(self):
        urls = request.args.get('urls')
        if not urls:
            abort(400)
        ids = [
            x.replace('/s-', '') for x in urls.split(',')
            if x.startswith('/s-')
        ]
        environments = []
        shortlinks = Shortlink.query.filter(Shortlink.link.in_(ids)).all()
        for shortlink in shortlinks:
            qs = {
                'repo': shortlink.repo,
                'owner': shortlink.owner,
                'name[]': [],
                'url[]': []
            }
            for k, v in json.loads(shortlink.revisions):
                qs['name[]'].append(k)
                qs['url[]'].append(v)
            url = '/?' + urlencode(qs, True)
            environments.append({
                'owner': shortlink.owner,
                'repo': shortlink.repo,
                'revisions': json.loads(shortlink.revisions),
                'url': url,
            })

        return make_response(jsonify({'environments': environments}))


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
        return redirect('/?' + urlencode(qs, True))


class GitHubAPI(MethodView):
    """The client needs to make queries to the GitHub API but a shortcoming
    is that it's impossible to include an auth token. And if you can't
    do that clients are likely to hit rate limits."""

    def get(self, thing):
        url = 'https://api.github.com'
        if thing == 'commits':
            copied = dict(request.args)
            owner = request.args.get('owner')
            repo = request.args.get('repo')
            if not owner:
                abort(400, "No 'owner'")
            if not repo:
                abort(400, "No 'repo'")

            url += '/repos/{}/{}/commits'.format(owner, repo)
            copied.pop('owner')
            copied.pop('repo')
            if copied:
                url += '?' + urlencode(copied, True)
            response = requests.get(
                url,
                headers=GITHUB_REQUEST_HEADERS,
                timeout=GITHUB_REQUEST_TIMEOUT
            )
            if response.status_code == 200:
                print(response.headers)
                response_json = response.json()
                print(len(response_json))
                resp = make_response(jsonify(response_json))
                return resp
            else:
                abort(response.status_code, response.content)
        else:
            abort(400)


app.add_url_rule('/shas', view_func=ShasView.as_view('shas'))
app.add_url_rule('/culprits', view_func=CulpritsView.as_view('culprits'))
app.add_url_rule('/shortenit', view_func=ShortenView.as_view('shortenit'))
app.add_url_rule('/shortened', view_func=ShortenedView.as_view('shortened'))
app.add_url_rule(
    '/githubapi/<string:thing>',
    view_func=GitHubAPI.as_view('githubapi')
)
app.add_url_rule(
    '/s-<string:link>', view_func=ShortlinkRedirectView.as_view('shortlink')
)


if __name__ == '__main__':
    db.create_all()

    app.debug = DEBUG
    port = int(os.environ.get('PORT', 5000))
    host = os.environ.get('HOST', '0.0.0.0')
    app.run(host=host, port=port)
