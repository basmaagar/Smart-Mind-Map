from neo4j import GraphDatabase
driver = GraphDatabase.driver('bolt://localhost:7687', auth=('neo4j', '1234567890'))
with driver.session() as session:
    res = session.run('MATCH (n:Concept) RETURN n.name, n.evidence LIMIT 5')
    for record in res:
        print("name:", record["n.name"])
        print("evidence:", record["n.evidence"])
