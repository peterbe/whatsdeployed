import ky from 'ky/umd';

let maxHistory = 5;
let history;
let cache;

const shortUrls = {
  /** Get the short URL for a long URL. */
  async fetchFor(longUrl) {
    const { url: shortUrl } = await ky
      .post('/shortenit', { json: { url: longUrl } })
      .json();
    shortUrls.addShortUrl(shortUrl);
    return shortUrl;
  },

  /** Get the long URL for a short URL. */
  async decode(code) {
    if (code.startsWith('s-')) {
      code = code.slice(2);
    }
    const params = await ky.get(`/lengthenit/${code}`).json();
    return params;
  },

  /** Get the metadata from the server for all shortUrls in the history. */
  async getAll() {
    if (!cache) {
      if (!history) {
        try {
          let json = localStorage.getItem('shortUrls') || '[]';
          history = JSON.parse(json);
        } catch (err) {
          console.error(
            'Error loading cached shortUrls from localStorage:',
            err,
          );
          localStorage.removeItem('shortUrls');
          history = [];
        }
      }

      if (history.length > 0) {
        const url = new URL(window.location.origin);
        url.pathname = '/shortened';
        url.searchParams.set('urls', history.join(','));
        const { environments } = await ky.get(url).json();
        cache = environments;
        return environments;
      } else {
        cache = [];
      }
    }

    return cache;
  },

  /**
   * Add a shortUrl to the cached history. If it is already in the history,
   * bring it to the front.
   */
  addShortUrl(shortUrl) {
    if (history) {
      let idx = history.indexOf(shortUrl);
      if (idx !== -1) {
        history.splice(idx, 1);
      }
      history.unshift(shortUrl);
      history = history.slice(0, maxHistory);
    } else {
      history = [shortUrl];
    }

    cache = null;
    localStorage.setItem('shortUrls', JSON.stringify(history));
  },

  /** Build a long URL from parts */
  buildLongUrl({ owner, repo, deployments }) {
    let newUrl = new URL(window.location);
    newUrl.pathName = '/';
    newUrl.search = '';
    newUrl.searchParams.append('owner', owner);
    newUrl.searchParams.append('repo', repo);
    for (const { name, url } of deployments) {
      newUrl.searchParams.append('name[]', name);
      newUrl.searchParams.append('url[]', url);
    }
    return newUrl;
  },
};
export default shortUrls;
