const cheerio = require('cheerio')
const ChildProcess = require('child_process')
const Crawler = require('simplecrawler')
const path = require('path')
const queue = require('async/queue')

module.exports = (options) => {
  const crawler = new Crawler(options.url)
  crawler.respectRobotsTxt = false
  crawler.parseHTMLComments = false
  crawler.parseScriptTags = false
  crawler.maxDepth = 1

  crawler.discoverResources = (buffer, item) => {
    const page = cheerio.load(buffer.toString('utf8'))
    const links = page('a[href]').map(function () {
      return page(this).attr('href')
    }).get()

    return links
  }

  let totalErrorCount = 0

  const lighthouseQueue = queue((url, callback) => {
    runLighthouse(url, (errorCount) => {
      totalErrorCount += errorCount
      callback()
    })
  }, 5)

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

function runLighthouse (url, callback) {
  const args = [
    url,
    '--output=json',
    '--output-path=stdout',
    '--disable-device-emulation',
    '--disable-cpu-throttling',
    '--disable-network-throttling',
    '--chrome-flags=--headless --disable-gpu',
    `--config-path=${path.join(__dirname, 'config.json')}`
  ]

  const lighthousePath = require.resolve('lighthouse/lighthouse-cli/index.js')
  const lighthouse = ChildProcess.spawn(lighthousePath, args)

  let output = ''
  lighthouse.stdout.on('data', (data) => {
    output += data
  })
  lighthouse.once('close', () => {
    let errorCount = 0

    const report = JSON.parse(output)

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
