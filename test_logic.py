from neo4j import GraphDatabase
driver = GraphDatabase.driver('bolt://localhost:7687', auth=('neo4j', '1234567890'))
with driver.session() as session:
    pid = "32c2c6ac-9743-46f1-b462-14cf4e48f15e"
    query = """
    MATCH (p:Project {id: $pid})-[:HAS_ROOT]->(n:Concept)
    OPTIONAL MATCH (n)-[r:RELATED_TO]->(m:Concept)
    RETURN n, r, m
    """
    res = session.run(query, {"pid": pid})
    elements = []
    results = list(res)
    for record in results:
        print("r is not None:", record.get("r") is not None)
        print("n is not None:", record.get("n") is not None)
        print("m is not None:", record.get("m") is not None)
        if record.get("r") is not None and record.get("n") is not None and record.get("m") is not None:
            source_id = str(record["n"]["name"]).lower().strip()
            target_id = str(record["m"]["name"]).lower().strip()
            elements.append(f"edge-{source_id}-{target_id}")
    print("Edges:", elements)
