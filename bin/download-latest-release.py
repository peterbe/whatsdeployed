#!/usr/bin/env python
import os
import subprocess
from urllib.parse import urlparse

import click
import requests
from decouple import config


REPO_URL = config(
    "REPO_URL", default="https://api.github.com/repos/peterbe/whatsdeployed"
)
URL = REPO_URL + "/releases"


def _check_output(*args, **kwargs):
    return subprocess.check_output(*args, **kwargs).decode("utf-8").strip()


def _download(url):
    r = requests.get(url)
    r.raise_for_status()
    if "application/json" in r.headers["content-type"]:
        return r.json()
    return r


@click.command()
@click.option("-v", "--verbose", is_flag=True)
@click.option("-t", "--tag-name", help="tag name if not the current")
@click.option("-d", "--destination", help="place to download the zip file (default ./)")
def cli(tag_name=None, verbose=False, destination=None):
    destination = destination or "."
    if not tag_name:
        tag_name = _check_output(
            [
                "git",
                "for-each-ref",
                "--sort=-taggerdate",
                "--count=1",
                "--format",
                "%(tag)",
                "refs/tags",
            ]
        )
    assert tag_name

    for release in _download(URL):
        if release["tag_name"] == tag_name:
            for asset in release["assets"]:
                if asset["content_type"] == "application/zip":
                    url = asset["browser_download_url"]
                    print("Downloading", url)
                    fn = os.path.basename(urlparse(url).path)
                    fp = os.path.join(destination, fn)
                    with open(fp, "wb") as f:
                        f.write(_download(url).content)
                    print("Downloaded", fp, os.stat(fp).st_size, "bytes")
                    break
            else:
                error_out("No application/zip asset found")
            break
    else:
        error_out("No tag name called {!r}".format(tag_name))


def error_out(msg, raise_abort=True):
    click.echo(click.style(msg, fg="red"))
    if raise_abort:
        raise click.Abort


if __name__ == "__main__":
    cli()
