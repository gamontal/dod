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
const spinner = ora({ spinner: 'line' });

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

const info = [
  'Type \"authorize\" and provide your API token to authorize your DigitalOcean account.',
  'A new token has been added.',
  'Droplet has been created.',
  'Droplet has been deleted.'
];

const errors = [
  'Error: account unauthorized, please provide a valid API token.',
  'Error: unable to create Droplet.',
  'Error: unable to delete Droplet.'
];

// Get the user's home directory
let getUserHome = function () {
  return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
};

// Fetch the configuration file
const CONFIG_FILE = getUserHome() + '/.dodrc.yml';

let config, token; // this variable will store the token for the current session

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
    config = yaml.safeLoad(fs.readFileSync(CONFIG_FILE, 'utf8')); // load config file
    token = config.access_token;
  } catch (e) {
    console.log(chalk.red(info[0]));
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
      snapshot.size_gigabytes + 'GB',
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
      backup.id,
      backup.created_at,
      backup.name,
      backup.distribution,
      backup.public,
      backup.regions,
      backup.size_gigabutes + 'GB',
      backup.min_disk_size
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

  return console.log('\n' + actionsList.toString() + '\n');
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
      droplet.memory + 'MB',
      droplet.disk + 'GB',
      droplet.region.name + ' (' + droplet.region.slug + ')'
    ]);
  });
  return console.log('\n' + neighborsList.toString() + '\n');
};

let printDropletInfo = function (arg, droplet) {
  spinner.stop();

  let basicInfo1 = new Table({
    chars: tableOptions.chars,
    style: {
      'compact' : true,
      'padding-left': 0
    },
    head: []
  });

  let basicInfo2 = new Table({
    chars: tableOptions.chars,
    style: tableOptions.style,
    head: ['ID', 'CREATED', 'PUBLIC IP (IPv4)',
           'STATUS', 'IMAGE', 'MEMORY', 'DISK', 'REGION']
  });

  let netInfo = new Table({
    chars: tableOptions.chars,
    style: tableOptions.style,
    head: ['VERSION', 'IP ADDRESS', 'NETMASK', 'GATEWAY', 'TYPE']
  });

  let imageTable = new Table({
    chars: tableOptions.chars,
    style: tableOptions.style,
    head: ['ID', 'NAME', 'CREATED', 'DISTRIBUTION', 'PUBLIC', 'TYPE', 'SIZE']
  });

  basicInfo1.push(['Droplet Name: ' + chalk.cyan(droplet.name) +
                   '\nLocked: ' + (droplet.locked === false ? chalk.green(droplet.locked) : chalk.red(droplet.locked)) +
                   '\nSnapshots: ' + droplet.snapshot_ids.length +
                   '\nBackups: ' + droplet.backup_ids.length,
                   '  Virtual CPUs: ' + droplet.vcpus +
                   '\n  Kernel: ' + (droplet.kernel === null ? chalk.magenta('NULL') : droplet.kernel.name) +
                   '\n  Features: ' + droplet.features +
                   '\n  Tags' + ': ' + (droplet.tags.length === 0 ? 'None' : droplet.tags)]);

  basicInfo2.push([
    droplet.id,
    moment(droplet.created_at).format('MMMM Do YYYY, h:mm:ss a'),
    droplet.networks.v4[0].ip_address,
    (droplet.status === 'active' ? chalk.green(droplet.status) : chalk.red(droplet.status)),
    droplet.image.distribution,
    droplet.memory + 'MB',
    droplet.disk + 'GB',
    droplet.region.name + ' (' + droplet.region.slug + ')'
  ]);

  droplet.networks.v4.forEach(function (resource) {
    netInfo.push([
      'v4',
      resource.ip_address,
      resource.netmask,
      resource.gateway,
      resource.type
    ]);
  });

  droplet.networks.v6.forEach(function (resource) {
    netInfo.push([
      'v6',
      resource.ip_address,
      resource.netmask,
      resource.gateway,
      resource.type
    ]);
  });

  imageTable.push([
    droplet.image.id,
    droplet.image.name,
    moment(droplet.image.created_at).format('MMMM Do YYYY, h:mm:ss a'),
    droplet.image.distribution,
    droplet.image.public,
    droplet.image.type,
    Math.round(droplet.image.size_gigabytes) + 'GB'
  ]);

  console.log('\n' + basicInfo1.toString());
  console.log('\n' + basicInfo2.toString() + '\n');
  console.log('Networks:\n');
  console.log(netInfo.toString() + '\n');
  console.log('Image:\n');
  console.log(imageTable.toString() + '\n');
};


cli
  .version(require('./package.json').version);

cli
  .command('auth <token>')
  .description('set a new access token')
  .action(function (token) {
    request.get(baseUrl + '/droplets', auth).on('error', function (err) {
      console.log('Error: ' + err);
      return;
    });

    fs.writeFile(CONFIG_FILE, 'access_token: ' + token, function(err) {
      if (err) {
        console.log('Error:' + err);
      } else {
        console.log(info[1]);
      }
    });
  });

cli
  .arguments('<droplet_id>')
  .option('-k, --kernels', 'list of all kernels available to a Droplet')
  .option('-s, --snapshots', 'retrieve the snapshots that have been created from a Droplet')
  .option('-b, --backups', 'retrieve any backups associated with a Droplet')
  .option('-a, --actions', 'retrieve all actions that have been executed on a Droplet')
  .option('-n, --neighbors', 'retrieve a list of droplets that are running on the same physical server')
  .action(function (arg) {
    spinner.text = 'Fetching Droplet data ...';
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
        if (d.id === Number(arg)) {
          droplet = d;
        }
      });

      if (droplet.id === undefined) {
        spinner.stop();

        console.log('Error: the Droplet with ID `' + arg + '` cannot be found');
        return;
      }

      let dropletId = droplet.id;
      let dropletName = droplet.name;
      let option;

      if (cli.kernels) { option = 'kernels'; }
      else if (cli.snapshots) { option = 'snapshots'; }
      else if (cli.backups) { option = 'backups'; }
      else if (cli.actions) { option = 'actions'; }
      else if (cli.neighbors) { option = 'neighbors'; }
      else {
        printDropletInfo(arg, droplet);
        return;
      }

      request.get(baseUrl + '/droplets/' + dropletId + '/' + option, auth, function (error, response, body) {
        spinner.stop();

        let output = JSON.parse(body);
        let totalResults = output[Object.keys(output)[0]].length;

        console.log('Droplet Name: ' + dropletName + ', ' +
                    'Total Results: ' + totalResults);

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
  .description('list Droplets')
  .action(function (tag_name) {
    spinner.text = 'Fetching Droplet list ...';
    spinner.start();
    request.get(baseUrl + '/droplets?' + (tag_name ? 'tag_name=' + tag_name : ''), auth, function (error, response, body) {
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
          chalk.cyan(droplet.name),
          droplet.networks.v4[0].ip_address,
          (droplet.status === 'active' ? chalk.green(droplet.status) : chalk.red(droplet.status)),
          droplet.image.distribution,
          droplet.memory + 'MB',
          droplet.disk + 'GB',
          droplet.region.name + ' (' + droplet.region.slug + ')'
        ]);
      });

      console.log('Droplets: ' + droplets.length);
      console.log('\n' + dropletsList.toString() + '\n');

      return;
    });
  });

cli
  .command('create <droplet_name>')
  .description('create a Droplet')
  .option('--region <region>', 'region of Droplet')
  .option('--image <image>', 'image slug (e.g. ubuntu-14-04-x64)')
  .option('--size <size>', 'size of Droplet')
  .option('--ssh-keys <keys>', 'comma seperated list of SSH Key names')
  .option('--backups', 'turn on backups')
  .option('--ipv6', 'turn on IPv6 networking')
  .option('--priv-net', 'turn on private networking')
  .option('--user-data', 'user data for creating server')
  .action(function (name, options) {
    spinner.text = 'Creating Droplet: ' + name + ' ...';
    spinner.start();

    let payload = {
      name: name,
      region: options.region || 'nyc2',
      size: options.size || '512mb',
      image: options.image || 'ubuntu-14-04-x64',
      ssh_keys: options.sshKeys || null,
      backups: options.backup || false,
      ipv6: options.ipv6 || false,
      user_data: options.userData || null,
      private_networking: options.privNet || null
    };

    request.post(
      baseUrl + '/droplets',
      {
        json: true,
        auth: auth.auth,
        body: payload
      }, function (error, response, body) {
        spinner.stop();

        if (response.statusCode === 202) {
          console.log(chalk.green(info[2]) + '\n');
        } else {
          console.log(errors[1]);
        }
      });
  });

cli
  .command('delete <droplet_id>')
  .description('delete a Droplet')
  .option('--tag <tag_name>', 'delete Droplets by a tag')
  .action(function (droplet_id, options) {
    spinner.text = 'Deleting Droplet ...';
    spinner.start();

    request
      .delete(
        baseUrl + '/droplets' + (options.tag ? '?tag_name=' + options.tag : '/' + droplet_id), auth,
        function (error, response, body) {
          spinner.stop();

          if (response.statusCode === 204) {
            console.log(chalk.green(info[3]) + '\n');
          } else {
            console.log(errors[2]);
          }
        });
  });

cli.parse(process.argv);
if (!process.argv.slice(2).length) { cli.outputHelp(); }

