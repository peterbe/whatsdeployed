#!/usr/bin/env node
const fs = require('fs');
const spawn = require('child_process').spawnSync;

const package = require('../package.json');
const name = package.name;

const spawnStr = (cmd, ...args) => {
  const spawned = spawn(cmd, ...args);
  return spawned.stdout.toString().trim();
};
const version = spawnStr('git', ['describe', '--always', '--tag']);

const logRaw = spawnStr('git', ['log', "--pretty=format:'%H--%cI'", '-n', '1']);

const log = logRaw.slice(1, logRaw.length - 1);
const commit = log.split('--')[0];
const date = log.split('--')[1];

console.log(
  JSON.stringify(
    {
      name,
      version,
      commit,
      date
    },
    undefined,
    2
  )
);
