#!/bin/sh

nginx

exec npx tsx apps/api/src/index.ts
