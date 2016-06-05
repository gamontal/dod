#!/usr/bin/env node

'use strict';

const fs = require('fs');
const request = require('request');
const yaml = require('js-yaml');
const moment = require('moment');
const ora = require('ora');
const Table = require('cli-table');
const chalk = require('chalk');
const cli = require('commander');
const spinner = ora({ text: chalk.cyan('Fetching ...'), spinner: 'line' });

// Get the user's home directory
function getUserHome () {
  return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
}

// Fetch the configuration file
const CONFIG_FILE = getUserHome() + '/.dodrc.yml';

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

const baseUrl = 'https://api.digitalocean.com/v2/droplets';
const auth = {
  'auth': { 'bearer': token }
};

let printKernels = function (kernels) {
  return console.log(kernels);
};

let printSnapshots = function (snapshots) {
  return console.log(snapshots);
};

let printBackups = function (backups) {
  return console.log(backups);
};

let printActions = function (actions) {
  return console.log(actions);
};

let printNeighbors = function (neighbors) {
  return console.log(neighbors);
};

let printAllNeighbors = function (neighbors) {
  return;
};

cli
  .version(require('./package.json').version);

cli
  .command('authorize <token>')
  .description('set a new DigitalOcean account token')
  .action(function (token) {

    request.get(baseUrl, auth).on('error', function (err) {
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
  .arguments('<droplet_name|droplet_id>')
  .option('-k, --kernels', 'list of all kernels available to a Droplet')
  .option('-s, --snapshots', 'retrieve the snapshots that have been created from a Droplet')
  .option('-b, --backups', 'retrieve any backups associated with a Droplet')
  .option('-a, --actions', 'retrieve all actions that have been executed on a Droplet')
  .option('-n, --neighbors', 'retrieve a list of droplets that are running on the same physical server')
  .option('-N, --all-neighbors', 'retrieve a list of any droplets that are running on the same physical hardware')
  .action(function (arg) {
    spinner.start();

    request.get(baseUrl, auth, function (error, response, body) {
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
        if ((d.name === arg) || (d.id === Number(arg))) {
          droplet = d;
        }
      });

      let dropletId = droplet.id;
      let option;

      if (cli['kernels']) { option = 'kernels'; }
      else if (cli['snapshots']) { option = 'snapshots'; }
      else if (cli['backups']) { option = 'backups'; }
      else if (cli['actions']) { option = 'actions'; }
      else if (cli['neighbors']) { option = 'neighbors'; }
      else {
        spinner.stop();
        return (droplet.id === undefined ? console.log('Server not found') : console.log(droplet));
      }

      request.get(baseUrl + '/' + dropletId + '/' + option, auth, function (error, response, body) {
        spinner.stop();

        let output = JSON.parse(body);

        switch (option) {
        case 'kernels':
          printKernels(output); break;
        case 'snapshots':
          printSnapshots(output); break;
        case 'backups':
          printBackups(output); break;
        case 'actions':
          printActions(output); break;
        case 'neighbors':
          printNeighbors(output); break;
        default:
          break;
        }
      });
    });
  });

cli
  .command('all')
  .description('list all available Droplets')
  .action(function () {
    spinner.start();
    request.get(baseUrl, auth, function (error, response, body) {
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

cli.parse(process.argv);
if (!process.argv.slice(2).length) { cli.outputHelp(); }

