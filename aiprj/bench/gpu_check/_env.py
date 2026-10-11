import os, sys, glob
def setup():
    base = os.path.join(sys.prefix, "Lib", "site-packages", "nvidia")
    for d in glob.glob(os.path.join(base, "*", "bin")):
        os.add_dll_directory(d)
        os.environ["PATH"] = d + os.pathsep + os.environ["PATH"]
