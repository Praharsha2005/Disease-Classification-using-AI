import tensorflow as tf
import numpy as np
import cv2
import base64

def generate_gradcam_base64(model, img_array, original_img, class_index):
    """
    Generates a Grad-CAM heatmap for a nested VGG16 model without creating sub-models.
    """
    # Ensure input is a float32 tensor
    img_tensor = tf.cast(img_array, tf.float32)

    # 1. Identify the layers from your model summary
    vgg_layer = model.get_layer("vgg16")
    gap_layer = model.get_layer("global_average_pooling2d")
    dense_layer = model.get_layer("dense")
    dropout_layer = model.get_layer("dropout")
    output_layer = model.get_layer("dense_1")

    # 2. Record the operations on GradientTape
    with tf.GradientTape() as tape:
        # Get the feature maps from VGG16 (7x7x512)
        # We watch these features specifically to get gradients for them
        last_conv_layer_output = vgg_layer(img_tensor)
        tape.watch(last_conv_layer_output)
        
        # Manually follow the rest of your model's architecture
        x = gap_layer(last_conv_layer_output)
        x = dense_layer(x)
        x = dropout_layer(x, training=False)
        preds = output_layer(x)
        
        # Targeted class score
        loss = preds[:, class_index]

    # 3. Compute gradients of the class score w.r.t. the feature maps
    grads = tape.gradient(loss, last_conv_layer_output)

    # 4. Global Average Pooling of gradients (importance weights)
    pooled_grads = tf.reduce_mean(grads, axis=(0, 1, 2))

    # 5. Weighted sum of feature map channels
    last_conv_layer_output = last_conv_layer_output[0]
    heatmap = last_conv_layer_output @ pooled_grads[..., tf.newaxis]
    heatmap = tf.squeeze(heatmap)

    # 6. Normalize the heatmap
    heatmap = tf.maximum(heatmap, 0) # ReLU
    max_val = tf.math.reduce_max(heatmap)
    if max_val != 0:
        heatmap /= max_val
    heatmap = heatmap.numpy()

    # 7. Visual Processing
    # Resize heatmap to match the original chest X-ray dimensions
    heatmap_resized = cv2.resize(heatmap, (original_img.shape[1], original_img.shape[0]))
    heatmap_uint8 = np.uint8(255 * heatmap_resized)
    heatmap_colored = cv2.applyColorMap(heatmap_uint8, cv2.COLORMAP_JET)

    # 8. Superimpose the heatmap onto the original image
    # 0.6 = image weight, 0.4 = heatmap weight
    superimposed_img = cv2.addWeighted(original_img, 0.6, heatmap_colored, 0.4, 0)
    superimposed_img = np.clip(superimposed_img, 0, 255).astype('uint8')

    # 9. Convert to Base64 for the React frontend
    _, buffer = cv2.imencode('.png', superimposed_img)
    return base64.b64encode(buffer).decode('utf-8')