What's Deployed?
================

What's deployed from a GitHub repo on various server environments?

This requires that you have 2 or more URLs that return a git sha that
references which git sha has been deployed.

![Example output](http://f.cl.ly/items/163S3J3n2s403z2r191w/Screen%20Shot%202013-11-01%20at%204.16.59%20PM.png)


Development
-----------

1. ``sudo apt-get install python-dev postgresql libpq-dev``
2. ``sudo -u postgres createuser $USER``
3. ``sudo -u postgres createdb whatsdeployed``
4. ``pip install -r requirements.txt``
5. ``DEBUG=1 SQLALCHEMY_DATABASE_URI='postgres:///whatsdeployed' ./app.py``
6. Visit http://localhost:5000/
