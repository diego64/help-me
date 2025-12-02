db = db.getSiblingDB('helpme-mongo-teste');
db.createUser({
    user: 'teste',
    pwd: 'senha',
    roles: [{ role: 'readWrite', db: 'helpme-mongo-teste' }]
});