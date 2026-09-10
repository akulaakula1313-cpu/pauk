const http=require('http'),fs=require('fs'),path=require('path');
const {MongoClient}=require('mongodb');

const PORT=process.env.PORT||3000,ROOT=__dirname;
const MONGO_URI=process.env.MONGO_URI||'';
const MONGO_DB=process.env.MONGO_DB||'sani_spider';
let mongoClient=null,logsCol=null,useMongo=false;

const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8','.ico':'image/x-icon'};

async function initMongo(){
  if(!MONGO_URI){console.warn('MONGO_URI не задан — логи в Mongo отключены.');return}
  mongoClient=new MongoClient(MONGO_URI);
  await mongoClient.connect();
  logsCol=mongoClient.db(MONGO_DB).collection('visits');
  await logsCol.createIndex({ts:-1});
  useMongo=true;
  console.log(`MongoDB подключена: база "${MONGO_DB}"`);
}

function logVisit(req,p){
  if(!useMongo||!logsCol)return;
  const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim();
  const ua=String(req.headers['user-agent']||'').slice(0,200);
  logsCol.insertOne({ip,ua,path:p,ts:new Date()}).catch(e=>console.error('log error:',e.message));
}

const server=http.createServer((req,res)=>{
  try{
    let p=decodeURIComponent((req.url||'/').split('?')[0]);
    if(p==='/')p='/index.html';
    if(p==='/favicon.ico')p='/favicon.svg';

    // API: последние 100 заходов
    if(p==='/api/visits'&&req.method==='GET'){
      if(!useMongo||!logsCol){
        res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
        return res.end(JSON.stringify({visits:[],mongo:false}));
      }
      logsCol.find({}).sort({ts:-1}).limit(100).toArray().then(list=>{
        res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
        res.end(JSON.stringify({visits:list,mongo:true}));
      }).catch(e=>{
        res.writeHead(500,{'Content-Type':'application/json; charset=utf-8'});
        res.end(JSON.stringify({error:e.message}));
      });
      return;
    }

    // логируем обычные заходы (кроме /api/)
    if(!p.startsWith('/api/'))logVisit(req,p);

    const file=path.resolve(ROOT,'.'+p);
    if(file!==ROOT&&!file.startsWith(ROOT+path.sep))return res.writeHead(403).end('Forbidden');
    fs.stat(file,(e,s)=>{
      if(e||!s.isFile())return res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'}).end('Not found');
      res.writeHead(200,{'Content-Type':MIME[path.extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-cache'});
      fs.createReadStream(file).pipe(res);
    });
  }catch(e){res.writeHead(400).end('Bad request')}
});

async function main(){
  try{await initMongo()}catch(e){console.error('Ошибка MongoDB:',e.message);useMongo=false}
  server.listen(PORT,()=>console.log(`SANI GROUP Spider running on port ${PORT}${useMongo?' (MongoDB)':''}`));
}

if(require.main===module)main().catch(e=>{console.error(e);process.exit(1)});

async function shutdown(sig){
  try{await mongoClient?.close()}catch{}
  process.exit(0);
}
process.on('SIGINT',()=>shutdown('SIGINT'));
process.on('SIGTERM',()=>shutdown('SIGTERM'));

module.exports={server};