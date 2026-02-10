import tensorflow as tf

validator_model = tf.keras.models.load_model(
    "model/xray_validator.keras",
    compile=False
)

def is_chest_xray(img_array, threshold=0.5):
    if img_array is None or img_array.shape != (1, 224, 224, 3):
        return False

    img = img_array * 255.0
    pred = validator_model.predict(img, verbose=0)[0][0]
    return pred >= threshold
