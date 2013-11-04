#!/usr/bin/env python
import os
import urllib

from flask import Flask, request, make_response, abort, jsonify, send_file
from flask.views import MethodView


DEBUG = os.environ.get('DEBUG', False) in ('true', '1')
app = Flask(__name__)


@app.route('/')
def index_html():
    return send_file('index.html')

class ShasView(MethodView):

    def post(self):
        deployments = []
        for each in request.json:
            name = each['name']
            url = each['url']
            content = urllib.urlopen(url).read().strip()
            if not len(content) == 40:
                # doesn't appear to be a git sha
                return make_response("Doesn't look like a sha", 400)
            deployments.append({
                'name': name,
                'sha': content,
                'bugs': []
            })
        response = make_response(jsonify({'deployments': deployments}))
        return response

app.add_url_rule('/shas', view_func=ShasView.as_view('shas'))

if __name__ == '__main__':
    app.debug = DEBUG
    port = int(os.environ.get('PORT', 5000))
    host = os.environ.get('HOST', '0.0.0.0')
    app.run(host=host, port=port)
