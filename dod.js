#!/usr/bin/env node

'use strict';

const fs = require('fs');
const request = require('request');
const yaml = require('js-yaml');
const moment = require('moment');
const ora = require('ora');
const Table = require('cli-table');
const chalk = require('chalk');
const spinner = ora({ text: chalk.cyan('Fetching droplets ...'), spinner: 'line' });
const cli = require('commander');

// Get the user's home directory
function getUserHome () {
  return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
}

// Fetch the configuration file
const CONFIG_FILE = getUserHome() + '/.dodrc.yml';

const urls = ['https://api.digitalocean.com/v2/droplets'];
let token;

(function () {

  // make sure the configuration file exists
  fs.stat(CONFIG_FILE, function (err) {
    if (err === null) {
      return;
    } else if (err.code == 'ENOENT') {
      fs.writeFile(CONFIG_FILE);
    } else {
      console.log('Unexpected error: ', err.code);
    }
  });

  try {
    token = yaml.safeLoad(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (e) {
    console.log(chalk.red('Type \"authorize\" and provide your API token to authorize your DigitalOcean account.'));
  }
}());

cli
  .version(require('./package.json').version);

cli
  .command('authorize <token>')
  .action(function (token) {

    request.get(urls[0], {
      'auth': {
        'bearer': token
      }
    }).on('error', function (err) {
      console.log('Error: ' + err);
      return;
    });

    fs.writeFile(CONFIG_FILE, token, function(err) {
      if (err) {
        console.log('Error:' + err);
      } else {
        console.log('A new token has been added.');
      }
    });
  });

cli
  .command('all')
  .action(function () {
    spinner.start();
    request.get(urls[0], {
      'auth': {
        'bearer': token
      }
    }, function (error, response, body) {
      spinner.stop();

      let data = JSON.parse(body);
      let droplets = data.droplets;

      if (error) {
        console.log('Error: ' + error);
        return;
      } else if (data.id == 'unauthorized') {
        console.log('Error: account unauthorized, please provide a valid API token.');
        return;
      }

      let basicInfo = new Table({
        chars: { 'top': '', 'top-mid': '', 'top-left': '', 'top-right': '',
                 'bottom': '', 'bottom-mid': '', 'bottom-left': '', 'bottom-right': '',
                 'left': '', 'left-mid': '', 'mid': '', 'mid-mid': '',
                 'right': '', 'right-mid': '', 'middle': '' },
        head: ['ID', 'CREATED', 'NAME', 'PUBLIC IP (v4)',
               'STATUS', 'IMAGE', 'MEMORY', 'DISK', 'REGION'],
        style: {
          'compact' : true,
          'head': ['inverse']
        }
      });

      droplets.forEach(function (droplet) {
        basicInfo.push(
          [droplet.id,
           moment(droplet.created_at).format('MMMM Do YYYY, h:mm:ss a'),
           droplet.name,
           droplet.networks.v4[0].ip_address,
           (droplet.status === 'active' ? chalk.green(droplet.status) : chalk.red(droplet.status)),
           droplet.image.distribution,
           droplet.size_slug,
           droplet.disk + 'gb',
           droplet.region.name + ' (' + droplet.region.slug + ')']
        );
      });
      console.log('\n' + basicInfo.toString() + '\n');
    });
  });

cli
  .arguments('<droplet_name>')
  .action(function (name) {
    request.get(urls[0], {
      'auth': {
        'bearer': token
      }
    }, function (error, response, body) {

      let data = JSON.parse(body);

      if (error) {
        console.log('Error: ' + error);
        return;
      } else if (data.id == 'unauthorized') {
        console.log('Error: account unauthorized, please provide a valid API token.');
        return;
      }

      const droplets = data.droplets;
      let droplet = {};

      droplets.forEach(function (d) {
        if (d.name === name) {
          droplet = d;
        }
      });

      return (droplet.id === undefined ? console.log('Server not found') : console.log(droplet));
    });
  });

cli.parse(process.argv);
if (!process.argv.slice(2).length) { cli.outputHelp(); }

