/**
 * MIGRATION script to add start_time and end_time to tasks table
 * Run this in your Supabase SQL Editor.
 */

ALTER TABLE tasks 
  ADD COLUMN start_time timestamp with time zone,
  ADD COLUMN end_time timestamp with time zone;
