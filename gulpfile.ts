import { series } from 'gulp';
import { spawn } from 'child_process';
import del from 'del';

export async function clean() {
    await del([ 'dist/**' ]);
}

export function compileTypescript() {
    return spawn('npx tsc -p src', { shell: true, stdio: 'inherit' });
}

export default function(done: () => void) {
    void series(clean, compileTypescript)(done);
}
