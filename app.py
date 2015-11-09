#!/usr/bin/env python
import json
import time
import os
import urllib
import urlparse
import cgi
import random

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
from flask.ext.sqlalchemy import SQLAlchemy


DEBUG = os.environ.get('DEBUG', False) in ('true', '1', 'on')

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get(
    'SQLALCHEMY_DATABASE_URI',
    'postgres://localhost/whatsdeployed'
)
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
            if '?' in url:
                url += '&'
            else:
                url += '?'
            url += 'cachescramble=%s' % time.time()
            content = urllib.urlopen(url).read().strip()
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


class ShortenView(MethodView):

    def post(self):
        url = request.form['url']
        qs = urlparse.urlparse(url).query
        parsed = cgi.parse_qs(qs)
        owner = parsed['owner'][0]
        repo = parsed['repo'][0]
        revisions = []
        for i, name in enumerate(parsed['name[]']):
            revisions.append((name, parsed['url[]'][i]))
        revisions.sort()
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
