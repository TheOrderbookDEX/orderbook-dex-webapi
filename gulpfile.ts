import { series } from 'gulp';
import { spawn } from 'child_process';
import rimraf from 'rimraf';
import { promisify } from 'util';

const promisifiedRimraf = promisify(rimraf);

export async function clean() {
    await promisifiedRimraf('dist/**');
}

export function compileTypescript() {
    return spawn('npx tsc -p src', { shell: true, stdio: 'inherit' });
}

export default function(done: () => void) {
    void series(clean, compileTypescript)(done);
}
