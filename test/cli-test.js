const assert = require('assert')
const ChildProcess = require('child_process')
const path = require('path')

const express = require('express')
const getPort = require('get-port')

describe('lightcrawler CLI', function () {
  this.timeout(60000)

  let server = null
  let pagesURL = null

  beforeEach(async function () {
    const port = await getPort(4000)
    const app = express()
    pagesURL = `http://localhost:${port}/pages`
    app.use('/pages', express.static(path.join(__dirname, 'fixtures', 'pages')))
    return new Promise((resolve, reject) => {
      server = app.listen(port, 'localhost', resolve)
    })
  })

  afterEach(function (done) {
    server.close(function () {
      done()
    })
  })

  describe('when the page has violations', function () {
    it('reports failures and exits non-zero', async function () {
      const {code, stdout, stderr} = await runLighthouse({
        config: path.join(__dirname, 'fixtures', 'config.json'),
        url: `${pagesURL}/document-write.html`
      })

      assert.equal(code, 1)
      assert.equal(stderr, '')
      assert.equal(stdout.includes('no-document-write'), true, stdout)
      assert.equal(stdout.includes('Best Practices: 1'), true, stdout)
    })
  })

  describe('when the page has no violations', function () {
    it('exits with zero', async function () {
      const {code, stdout, stderr} = await runLighthouse({
        config: path.join(__dirname, 'fixtures', 'config.json'),
        url: `${pagesURL}/empty.html`
      })

      assert.equal(code, 0)
      assert.equal(stderr, '')
      assert.equal(stdout.includes('Total Violations: None'), true, stdout)
    })
  })
})

function runLighthouse ({config, url}) {
  return new Promise((resolve, reject) => {
    const args = [
      path.join(__dirname, '..', 'cli.js'),
      '--config',
      config,
      '--url',
      url
    ]
    const lighthouseProcess = ChildProcess.spawn(process.execPath, args)
    let stdout = ''
    lighthouseProcess.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    let stderr = ''
    lighthouseProcess.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    lighthouseProcess.on('error', (error) => {
      reject(error)
    })
    lighthouseProcess.on('close', (code) => {
      stdout = stdout.trim()
      stderr = stderr.trim()
      resolve({code, stdout, stderr})
    })
  })
}
