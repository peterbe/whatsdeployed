#!/usr/bin/env python
import datetime
import shutil
import subprocess

import requests
from decouple import config


GITHUB_AUTH_TOKEN = config("GITHUB_AUTH_TOKEN")
REPO_URL = config(
    "REPO_URL", default="https://api.github.com/repos/peterbe/whatsdeployed"
)
URL = REPO_URL + "/releases"


def _check_output(*args, **kwargs):
    return subprocess.check_output(*args, **kwargs).decode("utf-8").strip()


def run(*args):

    last_tag = _check_output(
        [
            "git",
            "for-each-ref",
            "--sort=-taggerdate",
            "--count=1",
            "--format",
            "%(tag)|%(contents:subject)",
            "refs/tags",
        ]
    )
    if not last_tag:
        print("You don't have any previous tags in this git repo.")
        return 1

    last_tag, last_tag_message = last_tag.split("|", 1)
    # print("LAST_TAG:", last_tag)
    # print("last_tag_message:", last_tag_message)
    columns, _ = shutil.get_terminal_size()

    commits_since = _check_output(f"git log {last_tag}..HEAD --oneline".split())
    print("Commits since last tag: ".ljust(columns, "_"))
    commits_since_count = 0
    for commit in commits_since.splitlines():
        print("\t", commit)
        commits_since_count += 1

    if not commits_since_count:
        print("There has not been any commits since the last tag was made.")
        return 2

    print("-" * columns)

    # Next, come up with the next tag name.
    # Normally it's today's date in ISO format with dots.
    tag_name = datetime.datetime.utcnow().strftime("%Y.%m.%d")
    # But is it taken, if so how many times has it been taken before?
    existing_tags = _check_output(
        # ["git", "tag", "-l", "{}*".format(tag_name)]
        ["git", "tag", "-l"]
    ).splitlines()
    if tag_name in existing_tags:
        count_starts = len([x for x in existing_tags if x.startswith(tag_name)])
        tag_name += "-{}".format(count_starts + 1)

    tag_name = input(f"Tag name [{tag_name}]? ").strip() or tag_name
    if tag_name not in existing_tags:
        # Now we need to figure out what's been
        message = input("Tag message? (Optional, else all commit messages) ")
        if not message:
            message = commits_since

        # Now we can create the tag
        subprocess.check_call(["git", "tag", "-s", "-a", tag_name, "-m", message])

        # Let's push this now
        subprocess.check_call("git push origin master --tags".split())
    else:
        message = last_tag_message

    name = tag_name  # for now
    name = f"Static builds for {tag_name}"

    headers = {"Authorization": f"token {GITHUB_AUTH_TOKEN}"}

    response = requests.get(URL, headers=headers)
    response.raise_for_status()
    existing_releases = response.json()
    old_releases = {x["tag_name"]: x for x in existing_releases}
    if tag_name not in old_releases:
        release_data = {"tag_name": tag_name, "name": name, "body": message}
        response = requests.post(URL, headers=headers, json=release_data)
        response.raise_for_status()
        upload_url = response.json()["upload_url"]
    else:
        upload_url = old_releases[tag_name]["upload_url"]

    upload_url = upload_url.replace("{?name,label}", "?name=build.zip")

    headers.update(
        {"Accept": "application/vnd.github.v3+json", "Content-Type": "application/zip"}
    )
    with open("build.zip", "rb") as f:
        payload = f.read()
    response = requests.post(upload_url, headers=headers, data=payload)
    response.raise_for_status()
    print("💥Done!", response.json()["browser_download_url"])


if __name__ == "__main__":
    import sys

    sys.exit(run(*sys.argv[1:]))
