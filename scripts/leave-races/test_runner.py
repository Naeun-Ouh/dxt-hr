"""Offline harness safety tests; these are NOT PostgreSQL race evidence."""
import importlib.util
from pathlib import Path
import unittest
import subprocess
import sys
spec=importlib.util.spec_from_file_location('race_runner',Path(__file__).with_name('run.py'))
runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner)
class Safety(unittest.TestCase):
 def test_names_and_ports_fail_closed(self):
  runner.validate_target('dxt_leave_race_synthetic',55432)
  for name in ['postgres','production','dxt_leave_race_','dxt_leave_race_a;drop database postgres','postgres://localhost/db','dxt_leave_race_'+'a'*41]:
   with self.assertRaises(ValueError):runner.validate_target(name,55432)
  for port in [0,543,65536]:
   with self.assertRaises(ValueError):runner.validate_target('dxt_leave_race_test',port)
 def test_literal_quotes(self):
  self.assertEqual(runner.literal("a'b"),"'a''b'")
 def test_barrier_handles_multiple_buffered_rows(self):
  p=subprocess.Popen([sys.executable,'-c',"print('ignored');print('FIRST_MUTATED')"],stdout=subprocess.PIPE,text=True)
  try:runner.Harness.line(object(),p,'FIRST_MUTATED')
  finally:p.wait(timeout=5);p.stdout.close()
 def test_bootstrap_references_exist(self):
  for line in Path(__file__).with_name('bootstrap.sql').read_text().splitlines():
   if line.startswith('\\ir '):self.assertTrue((Path(__file__).parent/line[4:]).resolve().is_file())
if __name__=='__main__':unittest.main()
