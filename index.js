const cheerio = require('cheerio')
const Crawler = require('simplecrawler')
const ChildProcess = require('child_process')
const path = require('path')

const crawler = new Crawler('https://electron.atom.io')
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

crawler.on('fetchcomplete', (queueItem, responseBuffer, response) => {
  console.log('running lighthouse on ', queueItem.url)
  runLighthouse(queueItem.url)
})

function runLighthouse (url) {
  const lighthouse = ChildProcess.spawn(path.join(__dirname, 'node_modules', '.bin', 'lighthouse'), [
    url,
    '--output=json',
    '--output-path=stdout',
    '--disable-device-emulation',
    '--disable-cpu-throttling',
    '--disable-network-throttling',
    '--chrome-flags="--headless --disable-gpu"',
    `--config-path=${path.join(__dirname, 'config.json')}`
  ])

  let output = ''
  lighthouse.stdout.on('data', (data) => {
    output += data
  })
  lighthouse.once('close', () => {
    const report = JSON.parse(output)

    report.reportCategories.forEach((category) => {
      category.audits.forEach((audit) => {
        if (audit.score !== 100) {
          console.log(`${url} failed ${audit.id}`)
          audit.result.extendedInfo.value.nodes.forEach((result) => {
            console.log(result.failureSummary)
            console.log(result.path)
            console.log(result.html)
          })
        }
      })
    })
  })
}

crawler.start()
