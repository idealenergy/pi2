#!/usr/bin/perl

# Find out Pi version, OS, and IDEAL software version and environment var
# output is a JSON string. Assumes we're running Raspbian etc...

my %allvals=();
my $codedir = "/home/pi/pi";
my $ENVVAR = "NODE_ENV";

chdir $codedir;
my $cv = `git describe`; $cv=~s/\n//;
$allvals{"SOFTWARE_VERSION"} = $cv;
my $ev=`printenv $ENVVAR`; $ev=~s/\n//;
$allvals{$ENVVAR} = $ev;
my $piv=`grep Revision /proc/cpuinfo`;
$piv=~s/^.*:\s*//; $piv=~s/\n//;
# we know about 2 versions - otherwise just report the revision
if ($piv=~/a\d1041/) { $piv="2 Model B"; }
elsif ($piv=~/0010$/) { $piv="B+"; }
$allvals{"PI_VERSION"} = $piv;
my $osv=`grep PRETTY_NAME /etc/os-release`;
$osv=~s/PRETTY_NAME=\"//; $osv=~s/\"\s*\n//;
$allvals{"OS_VERSION"}=$osv;

print "{";
my $ct=0;
for my $key (keys %allvals) {
    if ($ct!=0) { print ", "; }
    print "\"$key\": \"$allvals{$key}\"";
    $ct++;
}
print "}\n";
