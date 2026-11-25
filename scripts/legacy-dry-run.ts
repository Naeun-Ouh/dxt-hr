import { readFile, writeFile, stat } from 'node:fs/promises';
import { dryRun, readMapping, readRows, workbookRows } from '../src/lib/migration/dry-run';

async function main() {
 const [format,source,mappingPath,output,...extra]=process.argv.slice(2);
 if(!['json','xlsx'].includes(format)||!source||!mappingPath||!output||extra.length)throw Error('USAGE');
 if((await stat(source)).size>5*1024*1024||(await stat(mappingPath)).size>1024*1024)throw Error('SIZE');
 const bytes=await readFile(source),mapping=readMapping(JSON.parse(await readFile(mappingPath,'utf8')));
 const input=format==='json'?{rows:readRows(JSON.parse(bytes.toString('utf8'))),diagnostics:[]}:await workbookRows(bytes,mapping);
 const report=dryRun(bytes,input.rows,mapping,input.diagnostics);
 // Exclusive creation: never replace a source/mapping/report or follow an existing symlink.
 await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
 process.stdout.write(JSON.stringify({status:report.reviewStatus,...report.counts,errors:report.diagnostics.filter(d=>d.severity==='ERROR').length})+'\n');
 if(report.reviewStatus==='BLOCKED')process.exitCode=2;
}
main().catch(()=>{process.stderr.write('Dry-run failed. Check command, input schema, file limits and a new writable output path. No database changes were made.\n');process.exitCode=1;});
