const cheerio = require('cheerio')
const ChildProcess = require('child_process')
const Crawler = require('simplecrawler')
const path = require('path')
const queue = require('async/queue')
const fs = require('fs')
const colors = require('colors')

const stats = {
  pageCount: 0,
  violationCounts: {},
  passedAuditsCount: 0,
  startTime: null,
  auditTimesByPageUrl: {}
}

module.exports = (options) => {
  stats.startTime = new Date()
  const configPath = path.resolve(options.config)
  const config = JSON.parse(fs.readFileSync(configPath))

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
      printStats()
      if (totalErrorCount > 0) {
        process.exit(1)
      }
    }
  })

  crawler.start()
}

function runLighthouse (url, configPath, callback) {
  stats.pageCount++
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

  stats.auditTimesByPageUrl[url] = {startTime: new Date()}
  lighthouse.once('close', () => {
    stats.auditTimesByPageUrl[url].endTime = new Date()
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
      let displayedCategory = false
      category.audits.forEach((audit) => {
        if (audit.score === 100) {
          stats.passedAuditsCount++
        } else {
          if (!displayedCategory) {
            console.log();
            console.log(category.name.bold.underline);
            displayedCategory = true
          }
          errorCount++
          console.log(url.replace(/\/$/, ''), '\u2717'.red, audit.id.bold, '-', audit.result.description.italic)

          if (stats.violationCounts[category.name] === undefined) {
            stats.violationCounts[category.name] = 0
          }

          if (audit.result.extendedInfo) {
            const {value} = audit.result.extendedInfo
            if (Array.isArray(value)) {
              stats.violationCounts[category.name] += value.length
              value.forEach((result) => {
                if (result.url) {
                  console.log(`   ${result.url}`)
                }
              })
            } else if (Array.isArray(value.nodes)) {
              stats.violationCounts[category.name] += value.nodes.length
              const messagesToNodes = {}
              value.nodes.forEach((result) => {
                let message = result.failureSummary
                message = message.replace(/^Fix any of the following:/g, '').trim()
                if (messagesToNodes[message]) {
                  messagesToNodes[message].push(result.html)
                } else {
                  messagesToNodes[message] = [result.html]
                }
              })
              Object.keys(messagesToNodes).forEach((message) => {
                console.log(`   ${message}`)
                messagesToNodes[message].forEach(node => {
                  console.log(`     ${node}`.gray)
                })
              })
            } else {
              stats.violationCounts[category.name]++
            }
          }
        }
      })
    })

    callback(errorCount)
  })
}

function printStats() {
  console.log();
  console.log();
  console.log('Lighthouse Summary'.bold.underline);
  console.log(`  Total Pages Scanned: ${stats.pageCount}`);
  console.log(`  Total Auditing Time: ${new Date() - stats.startTime} ms`);
  const totalTime = Object.keys(stats.auditTimesByPageUrl).reduce((sum, url) => {
    const {endTime, startTime} = stats.auditTimesByPageUrl[url]
    return (endTime - startTime) + sum
  }, 0)
  console.log(`  Average Page Audit Time: ${Math.round(totalTime/stats.pageCount)} ms`);
  console.log(`  Total Audits Passed: ${stats.passedAuditsCount}`, '\u2713'.green);
  if (Object.keys(stats.violationCounts).length === 0) {
    console.log(`  Total Violations: None! \\o/ 🎉`);
  } else {
    console.log(`  Total Violations:`);
    Object.keys(stats.violationCounts).forEach(category => {
      console.log(`    ${category}: ${stats.violationCounts[category]}`, '\u2717'.red);
    })
  }
}
