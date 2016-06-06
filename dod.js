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
const spinner = ora({ text: 'Fetching ...', spinner: 'line' });

// cli-table (module) chars and style options (borderless table)
const tableOptions = {
  chars: { 'top': '', 'top-mid': '', 'top-left': '', 'top-right': '',
           'bottom': '', 'bottom-mid': '', 'bottom-left': '', 'bottom-right': '',
           'left': '', 'left-mid': '', 'mid': '', 'mid-mid': '',
           'right': '', 'right-mid': '', 'middle': '' },
  style: {
    'compact' : true,
    'head': ['inverse']
  }
};

// list of common errors
const errors = ['Error: account unauthorized, please provide a valid API token.'];

// Get the user's home directory
let getUserHome = function () {
  return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
}

// Fetch the configuration file
const CONFIG_FILE = getUserHome() + '/.dodrc.yml';

let token; // this variable will store the token for the current session

(function () {
  // make sure the configuration file exists
  fs.stat(CONFIG_FILE, function (err) {
    if (err === null) {
      return; // exit function if the config file exist
    } else if (err.code == 'ENOENT') {
      fs.writeFile(CONFIG_FILE); // create config file if it doesn't exist
    } else {
      console.log('Unexpected error: ', err.code);
    }
  });

  try {
    token = yaml.safeLoad(fs.readFileSync(CONFIG_FILE, 'utf8')); // load config file
  } catch (e) {
    console.log(chalk.red('Type \"authorize\" and provide your API token to authorize your DigitalOcean account.'));
  }
}());

const baseUrl = 'https://api.digitalocean.com/v2'; // DigitalOcean API base url

// store authentication object for future requests
const auth = {
  'auth': { 'bearer': token }
};

/* Print out the list of kernels */
let printKernels = function (kernels) {
  let kernelsList = new Table({
    chars: tableOptions.chars,
    style: tableOptions.style,
    head: ['ID', 'NAME', 'VERSION']
  });

  kernels.kernels.forEach(function (kernel) {
    kernelsList.push([
      kernel.id,
      kernel.name,
      kernel.version
    ]);
  });

  return console.log('\n' + kernelsList.toString() + '\n');
};

/* Print out the list of snapshots */
let printSnapshots = function (snapshots) {
  let snapshotsList = new Table({
    chars: tableOptions.chars,
    style: tableOptions.style,
    head: ['ID', 'CREATED', 'NAME', 'DISTRIBUTION', 'PUBLIC', 'REGIONS', 'SIZE', 'MIN DISK SIZE']
  });

  snapshots.snapshots.forEach(function (snapshot) {
    snapshotsList.push([
      snapshot.id,
      snapshot.created_at,
      snapshot.name,
      snapshot.distribution,
      snapshot.public,
      snapshot.regions,
      snapshot.size_gigabytes,
      snapshot.min_disk_size
    ]);
  });

  return console.log('\n' + snapshotsList.toString() + '\n');
};

/* Print out the list of backups */
let printBackups = function (backups) {
  let backupsList = new Table({
    chars: tableOptions.chars,
    style: tableOptions.style,
    head: ['ID', 'CREATED', 'NAME',
           'DISTRIBUTION', 'PUBLIC',
           'REGIONS', 'SIZE', 'MIN DISK SIZE']
  });

  backups.backups.forEach(function (backup) {
    backupsList.push([
      backups.id,
      backups.created_at,
      backups.name,
      backups.distribution,
      backups.public,
      backups.regions,
      backups.size,
      backups.min_disk_size
    ]);
  });

  return console.log('\n' + backupsList.toString() + '\n');
};

/* Print out the list of actions */
let printActions = function (actions) {
  let actionsList = new Table({
    chars: tableOptions.chars,
    style: tableOptions.style,
    head: ['ID', 'TYPE', 'STATUS',
           'STARTED', 'COMPLETED', 'RESOURCE ID',
           'RESOURCE TYPE', 'REGION']
  });

  actions.actions.forEach(function (action) {
    actionsList.push([
      action.id,
      action.type,
      (action.status === 'in-progress' ? (
        chalk.yellow(action.status)) : action.status === 'errored' ? (
          chalk.red(action.status)) : chalk.green(action.status)),
      moment(action.started_at).format('MMMM Do YYYY, h:mm:ss a'),
      moment(action.completed_at).format('MMMM Do YYYY, h:mm:ss a'),
      action.resource_id,
      action.resource_type,
      action.region_slug
    ]);
  });

  return console.log('\n' + actionsList.toString() + '\n')
};

/* Print out the list of neighbors */
let printNeighbors = function (neighbors) {
  let neighborsList = new Table({
    chars: tableOptions.chars,
    style: tableOptions.style,
    head: ['ID', 'CREATED', 'NAME', 'PUBLIC IP (v4)',
           'STATUS', 'IMAGE', 'MEMORY', 'DISK', 'REGION']
  });

  neighbors.droplets.forEach(function (droplet) {
    neighborsList.push([
      droplet.id,
      moment(droplet.created_at).format('MMMM Do YYYY, h:mm:ss a'),
      droplet.name,
      droplet.networks.v4[0].ip_address,
      (droplet.status === 'active' ? chalk.green(droplet.status) : chalk.red(droplet.status)),
      droplet.image.distribution,
      droplet.size_slug,
      droplet.disk + 'gb',
      droplet.region.name + ' (' + droplet.region.slug + ')'
    ]);
  });
  return console.log('\n' + neighborsList.toString() + '\n');
};

/* Print out the droplet information */
let printDropletInfo = function (arg, droplet) {
  spinner.stop();
  return (droplet.id === undefined ? console.log('Error: the Droplet \"' + arg + '\" cannot be found') : console.log(droplet));
};


cli
  .version(require('./package.json').version)
  .usage('[command] [options] <droplet_name|droplet_id>');

cli
  .command('authorize <token>')
  .description('set a new DigitalOcean account token')
  .action(function (token) {
    request.get(baseUrl + '/droplets', auth).on('error', function (err) {
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
  .action(function (arg) {
    spinner.start();

    request.get(baseUrl + '/droplets', auth, function (error, response, body) {
      let data = JSON.parse(body);

      if (error) {
        console.log('Error: ' + error);
        return;
      } else if (data.id == 'unauthorized') {
        console.log(errors[0]);
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
      let dropletName = droplet.name;
      let option;

      if (cli['kernels']) { option = 'kernels'; }
      else if (cli['snapshots']) { option = 'snapshots'; }
      else if (cli['backups']) { option = 'backups'; }
      else if (cli['actions']) { option = 'actions'; }
      else if (cli['neighbors']) { option = 'neighbors'; }
      else {
        printDropletInfo(arg, droplet);
      }

      request.get(baseUrl + '/droplets/' + dropletId + '/' + option, auth, function (error, response, body) {
        spinner.stop();

        if (dropletName === undefined) {
          console.log(chalk.red('Error') + ': the Droplet \"' + arg + '\" cannot be found');
          return;
        }

        let output = JSON.parse(body);
        let totalResults = output[Object.keys(output)[0]].length;

        console.log(chalk.cyan('Droplet') + ': ' + dropletName + ', ' +
                    chalk.cyan('Total results') + ': ' + totalResults);

        if (totalResults === 0) { return; }

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
  .command('list [tag_name]')
  .description('list all available Droplets')
  .action(function (tag_name) {
    spinner.start();
    request.get(baseUrl + '/droplets?' + (tag_name ? tag_name : ''), auth, function (error, response, body) {
      spinner.stop();

      let data = JSON.parse(body);
      let droplets = data.droplets;

      if (error) {
        console.log('Error: ' + error);
        return;
      } else if (data.id == 'unauthorized') {
        console.log(errors[0]);
        return;
      }

      let dropletsList = new Table({
        chars: tableOptions.chars,
        style: tableOptions.style,
        head: ['ID', 'CREATED', 'NAME', 'PUBLIC IP (IPv4)',
               'STATUS', 'IMAGE', 'MEMORY', 'DISK', 'REGION']
      });

      droplets.forEach(function (droplet) {
        dropletsList.push([
          droplet.id,
          moment(droplet.created_at).format('MMMM Do YYYY, h:mm:ss a'),
          droplet.name,
          droplet.networks.v4[0].ip_address,
          (droplet.status === 'active' ? chalk.green(droplet.status) : chalk.red(droplet.status)),
          droplet.image.distribution,
          droplet.size_slug,
          droplet.disk + 'gb',
          droplet.region.name + ' (' + droplet.region.slug + ')'
        ]);
      });

      console.log(chalk.cyan('Droplets') + ': ' + droplets.length);
      console.log('\n' + dropletsList.toString() + '\n');

      return;
    });
  });

cli.parse(process.argv);
if (!process.argv.slice(2).length) { cli.outputHelp(); }

