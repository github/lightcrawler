#!/usr/bin/env node

const yargs = require('yargs')
const lightcrawler = require('.')

const options = yargs.demandOption(['c', 'u'])
  .alias('u', 'url').describe('url', 'URL to crawl')
  .alias('h', 'help').help('h')
  .alias('c', 'config').describe('config', 'Options for lighthouse')
  .argv

lightcrawler(options)
