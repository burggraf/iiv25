#!/bin/bash

mkdir -p ./data
supabase db dump --linked -f ./data/public-schema.sql --schema public

