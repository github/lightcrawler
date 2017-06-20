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

  const lighthouseQueue = queue(runLighthouse, 5);

  crawler.on('fetchcomplete', (queueItem, responseBuffer, response) => {
    lighthouseQueue.push(queueItem.url)
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
  const lighthouse = ChildProcess.spawn(path.join(__dirname, 'node_modules', '.bin', 'lighthouse'), args)

  let output = ''
  lighthouse.stdout.on('data', (data) => {
    output += data
  })
  lighthouse.once('close', () => {
    callback()

    const report = JSON.parse(output)

    report.reportCategories.forEach((category) => {
      category.audits.forEach((audit) => {
        if (audit.score !== 100) {
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
  })
}
