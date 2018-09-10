'use strict';

/**
 * $.parseParams - parse query string paramaters into an object.
 * https://gist.github.com/kares/956897
 */
(function($) {
  var re = /([^&=]+)=?([^&]*)/g;
  var decodeRE = /\+/g; // Regex for replacing addition symbol with a space
  var decode = function(str) {
    return decodeURIComponent(str.replace(decodeRE, ' '));
  };
  $.parseParams = function(query) {
    var params = {},
      e;
    while ((e = re.exec(query))) {
      var k = decode(e[1]),
        v = decode(e[2]);
      if (k.substring(k.length - 2) === '[]') {
        k = k.substring(0, k.length - 2);
        (params[k] || (params[k] = [])).push(v);
      } else params[k] = v;
    }
    return params;
  };
})(jQuery);

function shortSha(sha) {
  if (sha.length > 7) {
    return sha.substring(0, 7);
  }
  return sha;
}

var shortUrls = JSON.parse(localStorage.getItem('shortUrls') || '[]');

var BORS_LOGIN = 'bors[bot]';

function start(deployments, owner, repo, tags) {
  var shas = {};
  $('#deployments').append($('<th>').text('Commits on master'));
  $.each(deployments, function(i, thing) {
    var $th = $('<th>')
      .attr('id', thing.name + '-col')
      .append(
        $('<a>')
          .attr('title', 'Show column in Bugzilla')
          .text(thing.name)
      );
    $('#deployments').append($th);
    shas[thing.name] = thing.sha;
  });
  function commitUrl(sha) {
    return `https://github.com/${owner}/${repo}/commit/${sha}`;
  }
  function compareUrl(from, to) {
    return `https://github.com/${owner}/${repo}/compare/${shortSha(
      from
    )}...${shortSha(to)}`;
  }
  function bug_url(id) {
    return `https://bugzilla.mozilla.org/show_bug.cgi?id=${id}`;
  }
  function bug_id(msg) {
    if (msg.match(/\b\d{6,7}\b/g)) {
      return msg.match(/\b\d{6,7}\b/g)[0];
    }
    return false;
  }

  // Paint a table for all known URLs, and their GitHub URLs
  var urlsTable = $('table.urls tbody');
  var tr = $('<tr>');
  tr.append($('<th>').text('Revision URLs'));
  tr.append($('<th>').text('SHA'));
  $.each(deployments, function(i, each) {
    tr.append($('<td>').text(each.name));
  });
  tr.appendTo(urlsTable);

  $.each(deployments, function(i, each) {
    var tr = $('<tr>');
    tr.append(
      $('<td>').append(
        $('<a>')
          .attr('href', each.url)
          .text(each.name)
      )
    );
    var cell = $('<td>');
    cell.append(
      $('<a>')
        .attr('href', commitUrl(each.sha))
        .text(shortSha(each.sha))
    );
    var tag = tags[each.sha];
    if (tag) {
      cell.append(
        $('<span class="badge badge-pill badge-info">Info</span>')
          .attr('title', `Tag: ${tag}`)
          .text(tag)
      );
    }
    tr.append(cell);
    $.each(deployments, function(j, other) {
      if (each.url === other.url) {
        tr.append($('<td>').text('-'));
      } else {
        tr.append(
          $('<td>').append(
            $('<a>')
              .addClass('compare-url')
              .attr('href', compareUrl(each.sha, other.sha))
              .append(compareString(each.name, other.name))
          )
        );
      }
    });
    tr.appendTo(urlsTable);
  });

  function linkColumns() {
    $.each(deployments, function(i, thing) {
      if (thing.bugs.length) {
        var bug_query = thing.bugs.join('%2C');
        $(`#${thing.name}-col a`).attr(
          'href',
          `https://bugzilla.mozilla.org/buglist.cgi?bug_id=${bug_query}&bug_id_type=anyexact&bug_status=ALL`
        );
      }
    });
  }

  function makeMessage(commit) {
    var msg = commit.commit.message;
    var msg_split = msg.split(/\n\n+/);
    var msg_first;
    if (msg_split.length === 1) {
      msg_first = msg;
    } else {
      msg_first = msg_split[0];
    }
    var sha = commit.sha;
    var cell = $('<td>');
    if (commit.author && commit.author.avatar_url) {
      cell.append(
        $('<a>')
          .attr('href', commit.author.html_url)
          .append(
            $('<img>')
              .addClass('avatar')
              .attr('src', commit.author.avatar_url)
              .attr('width', '44')
              .attr('height', '44')
          )
      );
    }
    var bug_number = bug_id(msg);
    if (bug_number) {
      cell.append(
        $('<a>')
          .attr('href', bug_url(bug_number))
          .data('id', bug_number)
          .addClass('bug-' + bug_number)
          .addClass('bugzilla')
          .text(bug_number)
      );
      cell.append($('<span>').text(' - '));
    }
    cell.append(
      $('<a>')
        .attr('href', commit.html_url)
        .attr('title', msg)
        .addClass('commit')
        .text(msg_first)
    );
    var tag = tags[commit.sha];
    if (tag) {
      cell.append(
        $('<span class="badge badge-pill badge-info">Info</span>')
          .attr('title', `Tag: ${tag}`)
          .text(tag)
      );
    }
    return cell;
  }

  //var first_sha = deployments[0].sha;
  $('#cap').hide();
  var commitsURL = '/githubapi/commits';
  var PER_PAGE = 100;
  $.getJSON(
    commitsURL,
    { owner: owner, repo: repo, per_page: PER_PAGE },
    function(response) {
      var matched = {};
      var $commits = $('#commits');
      var keep_going = true;
      var cap = true;
      var hasBorsCommits = false;

      $.each(response, function(i, commit) {
        if (!keep_going && cap) return;
        var isBors =
          commit.author.login === BORS_LOGIN && commit.author.type === 'Bot';
        if (!hasBorsCommits && isBors) {
          hasBorsCommits = true;
        }
        $.each(shas, function(name, sha) {
          if (sha === commit.sha) {
            matched[name] = true;
          } else if (sha === commit.sha.substring(0, 7)) {
            matched[name] = true;
            commit.sha = commit.sha.substring(0, 7);
          }
        });
        var row = $('<tr>').append(makeMessage(commit));
        if (isBors) {
          row.addClass('bors-commit');
        }
        var all = true;
        $.each(deployments, function(i, thing) {
          if (matched[thing.name]) {
            row.append($('<td>').addClass('checked'));
            var bug_number = bug_id(commit.commit.message);
            if (bug_number) thing.bugs.push(bug_number);
          } else {
            all = false;
            row.append($('<td>').text(''));
          }
        });
        row.appendTo($commits);
        if (all) {
          linkColumns();
          fetchBugzillaMetadata();
          culprits(owner, repo, deployments);
          keep_going = false;
          $('#cap').show();
        }
      });
      if (keep_going) {
        $('#max .count').text(PER_PAGE);
        $('#max').show();
      }

      if (hasBorsCommits) {
        $('#bors').show(500);
      }

      var req = $.post('/shortenit', { url: location.href });
      req.then(function(r) {
        var fullUrl = location.protocol + '//' + location.host + r.url;
        $('#shorten a.short')
          .attr('href', r.url)
          .text(fullUrl);

        var envs = deployments
          .map(deployment => deployment.name.toLowerCase())
          .join(',');
        var badgeSrc = `https://img.shields.io/badge/whatsdeployed-${envs}-green.svg`;
        $('#shorten a.badge')
          .attr('href', r.url)
          .append($('<img>').attr('src', badgeSrc));
        $('#shorten').show();

        $('#badge-help .image-url').text(badgeSrc);
        $('#badge-help .markdown').text(
          `
[![What's Deployed](${badgeSrc})](${fullUrl})
      `.trim()
        );
        $('#badge-help .rest').text(
          `
.. |whatsdeployed| image:: ${badgeSrc}
    :target: ${fullUrl}
      `.trim()
        );

        if (
          !shortUrls.includes(r.url) ||
          (shortUrls.length && shortUrls[0] !== r.url)
        ) {
          // We either didn't have it or it wasn't first in the list
          shortUrls = shortUrls.filter(function(each) {
            return each !== r.url;
          });
          shortUrls.unshift(r.url);
          localStorage.setItem('shortUrls', JSON.stringify(shortUrls));
        }
      });
      req.fail(function(jqXHR, textStatus, errorThrown) {
        console.warn('URL shortening service failed', errorThrown);
      });
    }
  ).fail(function() {
    console.error.apply(console, arguments);
    showGeneralError('Unable to download commits for "' + commitsURL + '"');
  });
}

function showGeneralError(html) {
  $('#error p').text(html);
  $('#table').hide();
  $('#cloak').hide();
  $('#error')
    .hide()
    .fadeIn(300);
}

function showCulpritsError(html) {
  $('#culprits-error p').text(html);
  $('#culprits-error')
    .hide()
    .fadeIn(300);
}

function compareString(from, to) {
  return $('<span>')
    .append($('<span>').text('Compare '))
    .append($('<b>').text(from))
    .append($('<span>').text(' ↔ '))
    .append($('<b>').text(to));
}

function init(owner, repo, deployments, callback) {
  // document.title = "What's deployed on " + owner + "/" + repo + "?";
  document.title = `What's deployed on ${owner}/${repo}?`;
  var req = $.ajax({
    url: '/shas',
    type: 'POST',
    data: JSON.stringify({
      deployments: deployments,
      owner: owner,
      repo: repo
    }),
    contentType: 'application/json'
  });
  req.then(function(response) {
    if (response.error) {
      showGeneralError(response.error);
    } else {
      start(response.deployments, owner, repo, response.tags);
    }
    var titletag = document.head.querySelector(
      'meta[name="apple-mobile-web-app-title"]'
    );
    // Make it really short in case someone saves it to their Home screen
    // on an iPhone
    titletag.content = 'WD ' + repo;
    if (callback) callback();
  });
  req.fail(function(jqxhr, status, error) {
    console.warn('Unable to convert deployments to sha', status, error);
    showGeneralError(error);
  });
  var repo_url = 'https://github.com/' + owner + '/' + repo;
  $('.repo').append(
    $('<a>')
      .attr('href', repo_url)
      .text(repo_url)
  );
}

function paramsToDeployment(qs, callback) {
  var params = $.parseParams(qs.split('?')[1]);
  var owner, repo;
  if (params.owner) {
    owner = params.owner;
    $('#owner').val(owner);
  }
  if (params.repo) {
    repo = params.repo;
    $('#repo').val(repo);
  }
  var names = params.name;
  if (!names) {
    throw "No parameter called 'names'";
  }
  var urls = params.url;
  if (!urls) {
    throw "No parameter called 'urls'";
  }
  var deployments = [];
  $.each(names, function(i, name) {
    if (i >= $('input[name="name[]"]').length) {
      $('a.more').click();
    }
    $('input[name="name[]"]')
      .eq(-1)
      .val(name);
    var url = urls[i];
    $('input[name="url[]"]')
      .eq(-1)
      .val(url);
    deployments.push({ name: name, url: url });
  });
  if (owner && repo && deployments.length > 0) {
    init(owner, repo, deployments, callback);
    $('form').hide();
  } else if (callback) {
    callback();
  }
}

function culprits(owner, repo, deployments) {
  $.ajax({
    url: '/culprits',
    type: 'POST',
    data: JSON.stringify({
      owner: owner,
      repo: repo,
      deployments: deployments
    }),
    contentType: 'application/json'
  })
    .then(function(response) {
      if (response.error) {
        showCulpritsError(response.error);
        return;
      }
      var container = $('#culprits');
      $.each(response.culprits, function(i, group) {
        $('<h4>')
          .append($('<span>On </span>').addClass('on-prefix'))
          .append($('<span>').text(group.name))
          .appendTo(container);
        var users = $('<div>').addClass('users');
        $.each(group.users, function(j, userinfo) {
          var user_container = $('<div>').addClass('media');
          $('<a>')
            .attr('href', userinfo[1].html_url)
            .attr('target', '_blank')
            .attr('rel', 'noopener')
            .attr('title', userinfo[1].login)
            .append(
              $('<img>')
                .addClass('mr-3')
                .addClass('avatar')
                .attr('width', '44')
                .attr('height', '44')
                .attr('src', userinfo[1].avatar_url)
            )
            .appendTo(user_container);
          $('<div>')
            .addClass('media-body')
            .append(
              $('<h5>')
                .addClass('mt-0')
                .append(
                  $('<a>')
                    .attr('href', userinfo[1].html_url)
                    .text(userinfo[1].login)
                )
            )
            .append($('<p>').text(userinfo[0]))
            .appendTo(user_container);
          user_container.appendTo(container);
        });
        users.appendTo(container);
        if (group.links.length) {
          $('<h5>')
            .text('Links')
            .appendTo(container);
        }
        $.each(group.links, function(i, link) {
          $('<a>')
            .attr('target', '_blank')
            .attr('rel', 'noopener')
            .attr('href', link)
            .text(link)
            .appendTo(container);
        });
      });
      container.show();
    })
    .fail(function(jqxhr, status, error) {
      console.warn('Unable to convert deployments to culprits', status, error);
      showCulpritsError(error);
    });
}

function fetchBugzillaMetadata() {
  var ids = [];
  $('a.bugzilla').each(function() {
    ids.push($(this).data('id'));
  });
  if (!ids.length) return;
  var data = { id: ids.join(','), include_fields: 'status,id,resolution' };
  var req = $.ajax({
    url: 'https://bugzilla.mozilla.org/rest/bug',
    data: data,
    contentType: 'application/json',
    accepts: 'application/json'
  });
  req.done(function(response) {
    if (response.bugs) {
      $.each(response.bugs, function(i, bug) {
        var $links = $('a.bug-' + bug.id);
        $links.attr('title', bug.status + ' ' + bug.resolution);
        if (bug.status === 'RESOLVED' || bug.status === 'VERIFIED') {
          $links.addClass('resolved');
        }
      });
    }
  });
}

/* Return an interval you can clear if you want to. */
function makeProgressBar() {
  var bar = $('#cloak .progress-bar');
  var progress = 0;
  var interval = setInterval(function() {
    bar.css('width', '' + progress + '%').attr('aria-valuenow', '' + progress);
    var increment = 10;
    if (progress > 90) {
      increment = 1;
    } else if (progress > 80) {
      increment = 2;
    } else if (progress > 50) {
      increment = 4;
    }
    progress += increment;
    if (progress >= 100) {
      clearInterval(interval);
    }
    if (progress > 95) {
      if (!bar.hasClass('bg-danger')) {
        bar.removeClass('bg-warning').addClass('bg-danger');
      }
    } else if (progress > 85) {
      if (!bar.hasClass('bg-warning')) {
        bar.removeClass('bg-success').addClass('bg-warning');
      }
    }
  }, 300);
  return interval;
}

/* Return an interval you can clear if you want to. */
function makeDotter() {
  var c = $('#cloak .dots');
  var interval = setInterval(function() {
    c.text(c.text() + '.');
  }, 1000);
  return interval;
}

function giveUp() {
  if ($('#cloak:visible').length) {
    $('#cload .progress').hide();
    $('#cloak p').text(" F' it! I give up! This is taking too long.");
  }
}

function toggleShortenBadgeHelp() {
  $('#badge-help').toggle();
  $('#shorten a.help').text(
    $('#shorten a.help').text() === 'help?' ? 'close help' : 'help?'
  );
}

function listExistingShortUrls() {
  $.get('/shortened', { urls: shortUrls.join(',') })
    .then(function(r) {
      if (r.environments.length) {
        var parent = $('#previous ul');
        r.environments.forEach(function(env) {
          console.log(env.revisions, typeof env.revisions);
          // Why can't I use env.revisions.map??
          var names = env.revisions.map(function(rev) {
            return rev[0];
          });
          $('<li>')
            .append(
              $('<a>')
                .attr('href', env.url)
                .text(`${env.owner}/${env.repo}`)
            )
            .append(
              $('<span>')
                .addClass('names')
                .text(names.join(', '))
            )
            .appendTo(parent);
        });
        $('#previous').show();
      }
    })
    .fail(function(jqXHR, textStatus, errorThrown) {
      console.warn('URL shortening service failed', errorThrown);
    });
}

$(function() {
  $('form').on('click', 'button.more', function(event) {
    event.preventDefault();
    $('.revisions')
      .append(
        $(
          '<input type="text" name="name[]" class="form-control name" placeholder="Name">'
        )
      )
      .append(
        $(
          '<input type="text" name="url[]" class="form-control url" placeholder="URL to revision data">'
        )
      );
  });

  /* Really basic validation */
  $('form').on('submit', function(event) {
    var owner = $('input[name="owner"]', this)
      .val()
      .trim();
    if (!owner) {
      event.preventDefault();
      return alert("Missing 'Owner' input");
    }
    var repo = $('input[name="repo"]', this)
      .val()
      .trim();
    if (!repo) {
      event.preventDefault();
      return alert("Missing 'Repository' input");
    }
    if (!$('input.name', this).val()) {
      event.preventDefault();
      return alert("Missing 'Revision URL name' input");
    }
    if (!$('input.url', this).val()) {
      event.preventDefault();
      return alert("Missing 'Revision URL' input");
    }
    return true;
  });

  $('#shorten').on('click', 'a.help', function(event) {
    toggleShortenBadgeHelp();
  });

  $('button.reload').on('click', function() {
    document.location.reload(true);
  });

  function makeShortBorsMessage(commit) {
    /* Extract out the lines that are generated by bors as the
    real commit message. Then return these with a '; ' delimimiter. An example
    (full) bors commit message can look like this:
    --------------------------------------------------------------------------
    Merge #1520

    1520: Update python:3.6 Docker digest to 7eced2 r=mythmon a=renovate[bot]

    <p>This Pull Request updates Docker base image <code>python:3.6-slim</code> to the latest digest (<code>sha256:7eced2b....f967188845</code>). For details on Renovate's Docker support, please visit <a href="https://renovatebot.com/docs/docker">https://renovatebot.com/docs/docker</a></p>
    <hr />
    <p>This PR has been generated by <a href="https://renovatebot.com">Renovate Bot</a>.</p>

    Co-authored-by: Renovate Bot <bot@renovateapp.com>
    --------------------------------------------------------------------------
    */
    console.log({ commit });
    var paragraphs = commit.split(/\n\n/g).filter(function(paragraph) {
      return /^\d+: /.test(paragraph);
    });
    return paragraphs.join('; ');
  }

  $('#bors input[type="checkbox"]').on('change', function(event) {
    var checked = this.checked;
    if (checked) {
      $('#commits tr:not(.bors-commit)').hide();
      // Get fancy
      $('#commits tr.bors-commit td a.commit').each(function() {
        var a = $(this);
        if (!a.data('commit')) {
          a.data('commit', a.attr('title'));
          a.data('orig-text', a.text());
        }
        a.text(makeShortBorsMessage(a.data('commit')));
      });
    } else {
      $('#commits tr:not(.bors-commit)').show();
      // Restore
      $('#commits tr.bors-commit td a.commit').each(function() {
        var a = $(this);
        a.text(a.data('orig-text'));
      });
    }
  });

  if (location.search) {
    var dotter = makeDotter();
    var progressBarer = makeProgressBar();

    paramsToDeployment(location.search, function() {
      $('h2').text(
        $('h2')
          .text()
          .replace('?', '')
      );
      $('#cloak').hide();
      $('#table')
        .hide()
        .fadeIn(500);
      clearInterval(dotter);
      clearInterval(progressBarer);
    });

    setTimeout(function() {
      // If the cloak is still visible, that means took more than this time
      // for the paramsToDeployment() to call back. This is our equivalent
      // of a timeout.
      giveUp();
      clearInterval(dotter);
      clearInterval(progressBarer);
    }, 10000);
  } else {
    $('#cloak').hide();
    $('form')
      .hide()
      .fadeIn(500);

    if (shortUrls.length) {
      // You've been here before!
      listExistingShortUrls();
    }
  }
});
