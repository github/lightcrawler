const cheerio = require('cheerio')
const ChildProcess = require('child_process')
const Crawler = require('simplecrawler')
const path = require('path')
const queue = require('async/queue')
const fs = require('fs')

module.exports = (options) => {
  const config = JSON.parse(fs.readFileSync(options.config))
  const configPath = path.resolve(options.config)

  const crawler = new Crawler(options.url)
  crawler.respectRobotsTxt = false
  crawler.parseHTMLComments = false
  crawler.parseScriptTags = false
  crawler.maxDepth = config.settings.crawler.maxDepth || 1

  crawler.discoverResources = (buffer, item) => {
    const page = cheerio.load(buffer.toString('utf8'))
    const links = page('a[href]').map(function () {
      return page(this).attr('href')
    }).get()

    return links
  }

  let totalErrorCount = 0

  const lighthouseQueue = queue((url, callback) => {
    runLighthouse(url, configPath, (errorCount) => {
      totalErrorCount += errorCount
      callback()
    })
  }, config.settings.crawler.maxChromeInstances)

  crawler.on('fetchcomplete', (queueItem, responseBuffer, response) => {
    lighthouseQueue.push(queueItem.url)
  })
  crawler.once('complete', () => {
    lighthouseQueue.drain = () => {
      if (totalErrorCount > 0) {
        process.exit(1)
      }
    }
  })

  crawler.start()
}

function runLighthouse (url, configPath, callback) {
  const args = [
    url,
    '--output=json',
    '--output-path=stdout',
    '--disable-device-emulation',
    '--disable-cpu-throttling',
    '--disable-network-throttling',
    '--chrome-flags=--headless --disable-gpu',
    `--config-path=${configPath}`
  ]

  const lighthousePath = require.resolve('lighthouse/lighthouse-cli/index.js')
  const lighthouse = ChildProcess.spawn(lighthousePath, args)

  let output = ''
  lighthouse.stdout.on('data', (data) => {
    output += data
  })
  lighthouse.once('close', () => {
    let errorCount = 0

    let report
    try {
      report = JSON.parse(output)
    } catch (parseError) {
      console.error(`Parsing JSON report output failed: ${output}`)
      callback(1)
      return
    }

    report.reportCategories.forEach((category) => {
      category.audits.forEach((audit) => {
        if (audit.score !== 100) {
          errorCount++
          console.log(`${url} failed ${audit.id}`)

          const {value} = audit.result.extendedInfo
          if (Array.isArray(value)) {
            value.forEach((result) => {
              console.log(`  ${result.url}`)
            })
          } else if (Array.isArray(value.nodes)) {
            value.nodes.forEach((result) => {
              let message = result.failureSummary
              message = message.replace(/^Fix any of the following:/g, '').trim()
              console.log(`  ${message}`)
              console.log(`  ${result.html}`)
            })
          }
        }
      })
    })

    callback(errorCount)
  })
}
