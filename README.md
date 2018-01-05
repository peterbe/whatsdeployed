What's Deployed?
================

**NOTE: This requires Python 3**

What's deployed from a GitHub repo on various server environments?

This requires that you have 2 or more URLs that return a git sha that
references which git sha has been deployed.

Screenshots
-----------

### Main table
![Example output](screenshot.png)

### "Culprits"
!["Culprits"](culprits.png)

License
-------

[MPL 2.0](http://www.mozilla.org/MPL/2.0/)

Credits
-------

[Checkbox icon](https://www.iconfinder.com/icons/282474/check_done_ok_icon#size=16)
by [IcoCentre](https://www.iconfinder.com/konekierto).

Development
-----------

1. ``sudo apt-get install python-dev postgresql libpq-dev``
2. ``sudo -u postgres createuser $USER``
3. ``sudo -u postgres createdb whatsdeployed``
4. ``pip install -r requirements.txt``
5. ``DEBUG=1 SQLALCHEMY_DATABASE_URI='postgres:///whatsdeployed' ./app.py``
6. Visit http://localhost:5000/
