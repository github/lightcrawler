# lightcrawler

Crawl a website and run it through [Google Lighthouse](https://github.com/GoogleChrome/lighthouse).

## Installing

```bash
npm install --save-dev lightcrawler
```

## Running

```bash
lightcrawler --url https://atom.io/ --config lightcrawler-config.json
```

where `lightcrawler-config.json` looks something like this:

```json
{
  "extends": "lighthouse:default",
  "settings": {
    "crawler": {
      "maxDepth": 2,
      "maxChromeInstances": 5
    },
    "onlyCategories": [
      "Accessibility",
      "Performance",
      "Best Practices"
    ],
    "onlyAudits": [
      "accesskeys",
      "aria-allowed-attr",
      "external-anchors-use-rel-noopener",
      "geolocation-on-start",
      "no-document-write",
      "no-mutation-events",
      "no-old-flexbox",
      "time-to-interactive",
      "user-timings",
      "viewport",
      "without-javascript"
    ]
  }
}
```

### Running on CI

You can set this up on Travis with the following `.travis.yml` config:

```yml
dist: trusty

addons:
  chrome: beta
```

See https://docs.travis-ci.com/user/gui-and-headless-browsers/#Using-the-Chrome-addon-in-the-headless-mode
for more details.

Enjoy!
