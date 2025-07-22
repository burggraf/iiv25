psql $DB -c "set statement_timeout=0;select * from classify_all_products() limit 10;"
