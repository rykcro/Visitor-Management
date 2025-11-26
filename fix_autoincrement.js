const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'visitor_management_system'
  });
  
  try {
    const [maxResult] = await conn.execute('SELECT MAX(id) as max_id FROM visitors');
    const maxId = maxResult[0]?.max_id || 0;
    console.log('Max ID in table:', maxId);
    
    const nextId = maxId + 1;
    await conn.execute(`ALTER TABLE visitors AUTO_INCREMENT = ${nextId}`);
    console.log('Reset AUTO_INCREMENT to:', nextId);
    
    console.log('Auto-increment fixed successfully!');
  } catch (err) {
    console.error('Error:', err.message);
  }
  
  await conn.end();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
