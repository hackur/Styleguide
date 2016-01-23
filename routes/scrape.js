var express = require('express'),
  jf = require('jsonfile'),
  fs = require('fs'),
  async = require('async'),
  sassScraper = require('./sassScraper.js'),
  snippetScraper = require('./snippetScraper.js'),
  config = JSON.parse(fs.readFileSync('./styleguide/database_config.txt', 'utf8')),

  router = express.Router();

var pushAsyncTask = function(snippets, category, uniques) {
  return function(callback) {
    snippetScraper.writeOutSnippets(snippets, category, uniques, function(changedSnipps, newSnipps) {
      callback(null, {
        changedSnipps: changedSnipps,
        newSnipps: newSnipps
      });
    });
  };
};

router.get('/snippets', function(req, res) {
  snippetScraper.requestPages(config.scrapeUrls, function(responses) {
    var filteredHTml = [],
      filters,
      htmlBody,
      snippets = {},
      newSnippet,
      category,
      url,
      response,
      index,
      allSnippets = [],
      length,
      asyncTasks = [],
      report = {},
      uniques = jf.readFileSync(config.uniques, {
        throws: false
      }) || [];

    for (url in responses) {
      if (responses.hasOwnProperty(url)) {
        response = responses[url];

        if (response.error) {
          console.log("Error", url, response.error);
          return;
        }

        if (response.body) {
          htmlBody = response.body;
          // matches all the snippet body (<!-- snippet:start 1:1 include-js --><div id="example"></div><!-- snippet:end -->)
          filters = htmlBody.match(/<!-- snippet:start [\d\D]*?snippet:end -->/gi);
          filteredHTml = filteredHTml.concat(filters);
        }
      }
    }

    report.totalFound = filteredHTml.length;
    report.changedSnippets = [];
    report.duplicateIds = [];
    report.foundNew = 0;

    for (index = 0, length = filteredHTml.length; index < length; index++) {
      if (filteredHTml[index]) {
        newSnippet = snippetScraper.buildSnippetFromHtml(filteredHTml[index], snippets);

        allSnippets.push(newSnippet.id);

        if (!newSnippet) {
          res.status(500).send('Something went wrong when building snippet from HTML!');
          return;
        }
      }
    }

    allSnippets.sort();

    for (index = 0, length = allSnippets.length; index < length; index++) {
      if (allSnippets[index + 1] === allSnippets[index]) {
        report.duplicateIds.push(allSnippets[index]);
      }
    }

    for (category in snippets) {
      if (snippets.hasOwnProperty(category)) {
        asyncTasks.push(pushAsyncTask(snippets, category, uniques));
      }
    }

    async.series(asyncTasks, function(err, reports) {
      var index,
        len = reports.length;

      for (index = 0; index < len; index++) {
        report.changedSnippets = report.changedSnippets.concat(reports[index].changedSnipps);
        report.foundNew += reports[index].newSnipps;
      }

      jf.writeFileSync(config.uniques, uniques);

      res.json(report);
    });
  });

});

router.get('/sass', function(req, res) {
  var result = [],
    index,
    sassPaths = req.app.get('sassPaths'),
    maxSassIterations = req.app.get('maxSassIterations'),
    length = sassPaths.length,
    report = [];

  for (index = 0; index < length; index++) {
    report.push(sassScraper.scrapeTheme(index, result, sassPaths, maxSassIterations));
  }

  jf.writeFileSync(config.sassData, result);

  res.json(report);
});

module.exports = router;