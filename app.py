#!/usr/bin/env python
import json
import time
import os
import urllib

from flask import Flask, request, make_response, abort, jsonify, send_file
from flask.views import MethodView


DEBUG = os.environ.get('DEBUG', False) in ('true', '1')
BITLY_ACCESS_TOKEN = os.environ.get('BITLY_ACCESS_TOKEN', '')

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
                return make_response(jsonify({'error': error,}))
            deployments.append({
                'name': name,
                'sha': content,
                'bugs': []
            })
        response = make_response(jsonify({'deployments': deployments}))
        return response

class ShortenView(MethodView):

    def post(self):
        if not BITLY_ACCESS_TOKEN:
            return make_response("BITLY_ACCESS_TOKEN not set up", 500)

        url = request.form['url']
        bitly_base_url = 'https://api-ssl.bitly.com/v3/shorten'
        qs = urllib.urlencode({
            'access_token': BITLY_ACCESS_TOKEN,
            'longUrl': url
        })
        bitly_url = '%s?%s' % (bitly_base_url, qs)
        response = urllib.urlopen(bitly_url).read()
        result = json.loads(response)
        if result.get('status_code') == 500:
            raise ValueError(result.get('status_txt'))
        url = result['data']['url']
        return make_response(jsonify({'url': url}))


app.add_url_rule('/shas', view_func=ShasView.as_view('shas'))
app.add_url_rule('/shortenit', view_func=ShortenView.as_view('shortenit'))

if __name__ == '__main__':
    app.debug = DEBUG
    port = int(os.environ.get('PORT', 5000))
    host = os.environ.get('HOST', '0.0.0.0')
    app.run(host=host, port=port)
