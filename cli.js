#!/usr/bin/env node

const yargs = require('yargs')
const lightcrawler = require('.')

const options = yargs
  .alias('u', 'url').describe('url', 'URL to crawl')
  .alias('h', 'help').help('h')
  .argv

lightcrawler(options)
