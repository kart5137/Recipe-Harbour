"""Empty stand-in for tensorflow_decision_forests.

tensorflowjs 4.22 imports this package at module load only to register decision-forest
ops; it is never used when converting ordinary Keras models, and it has no Windows build.
Put this directory on sys.path (model/export_tfjs.py does) only for the conversion step.
"""
