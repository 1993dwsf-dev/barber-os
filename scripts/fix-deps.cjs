#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

delete pkg.dependencies['@radix-ui/react-label'];
delete pkg.dependencies['@radix-ui/react-input-otp'];

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
console.log('Removed deprecated @radix-ui/react-label and @radix-ui/react-input-otp from dependencies.');
