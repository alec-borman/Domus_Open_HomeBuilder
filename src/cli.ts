#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { parse } from './parser.js';
import { serialize, injectNode } from './patcher.js';

function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.error('Usage: domus <command> [options]');
        process.exit(1);
    }

    const command = args[0];

    switch (command) {
        case 'check': {
            const filePath = args[1];
            if (!filePath) {
                console.error('Missing file path for check command');
                process.exit(1);
            }
            try {
                const source = readFileSync(filePath, 'utf-8');
                const { diagnostics } = parse(source);
                if (diagnostics.length > 0) {
                    console.error('Syntax errors found:');
                    for (const d of diagnostics) {
                        console.error(`  [${d.code}] ${d.message} at line ${d.line}:${d.col}`);
                    }
                    process.exit(1);
                }
                console.log('OK');
                process.exit(0);
            } catch (err: any) {
                console.error(`Error reading file: ${err.message}`);
                process.exit(1);
            }
        }
        case 'parse': {
            const filePath = args[1];
            if (!filePath) {
                console.error('Missing file path for parse command');
                process.exit(1);
            }
            try {
                const source = readFileSync(filePath, 'utf-8');
                const { ast, diagnostics } = parse(source);
                if (diagnostics.length > 0) {
                    process.exit(1);
                }
                console.log(JSON.stringify(ast, null, 2));
                process.exit(0);
            } catch (err: any) {
                console.error(`Error reading file: ${err.message}`);
                process.exit(1);
            }
        }
        case 'patch': {
            const filePath = args[1];
            const injectIndex = args.indexOf('--inject');
            if (!filePath || injectIndex === -1 || injectIndex + 2 >= args.length) {
                 console.error('Usage: domus patch <file> --inject <path> <snippet>');
                 process.exit(1);
            }
            const path = args[injectIndex + 1];
            const snippet = args[injectIndex + 2];
            try {
                const source = readFileSync(filePath, 'utf-8');
                const { ast, diagnostics } = parse(source);
                if (diagnostics.length > 0) {
                     console.error('Cannot patch file with syntax errors.');
                     process.exit(1);
                }
                const result = injectNode(ast, path, snippet);
                if (result.diagnostics.length > 0 || !result.cst) {
                    console.error('Patch failed:', result.diagnostics);
                    process.exit(1);
                }
                const newSource = serialize(result.cst);
                writeFileSync(filePath, newSource, 'utf-8');
                console.log('Patch successful.');
                process.exit(0);
            } catch (err: any) {
                console.error(`Error patching file: ${err.message}`);
                process.exit(1);
            }
        }
        case 'format': {
            console.log('Format not implemented yet.');
            process.exit(0);
        }
        default:
            console.error(`Unknown command: ${command}`);
            process.exit(1);
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
   main();
}
