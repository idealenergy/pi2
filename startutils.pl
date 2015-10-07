#!/usr/bin/perl

# Start processes to gather "other forms of data" - for example
# CurrentCost data; HeatMeter data

my @knownDataProviders = ("CurrentCost", "HeatMeter");
my %processes = ("CurrentCost" => "./currentcost2ideal.pl", "HeatMeter" => "./heatmeter_receive.py");
my %dmesgGrep = ("CurrentCost" => "pl2303", "HeatMeter" => "FTDI");

for my $datasource (@knownDataProviders) {
  # this likely won't work with e.g. memory sticks attached to Pi - check if it wrks after reboot..
  my $resc = "dmesg | grep usb | grep attach | grep $dmesgGrep{$datasource} | tail -1";
  my $res = `$resc`; $res =~ s/\s*\n$//; $res =~s/^.*\s+//;
  my $commname = $processes{$datasource};
  my $grepfor = $commname; $grepfor =~ s/^.*\///;
  my $exproc = `pgrep -f $grepfor`;
  if ($exproc && $exproc!~/^\s*$/) {
    print "Process to receive data from $datasource already running.\n";
  } else {
    my $command = "$commname -input $res";
    print "execute $command\n";
    system("$command &");
  }
}
