// dashboard.js

// 1. Real-time calculator for the UI
function calculateTotal() {
    const vehicleQty = parseInt(document.getElementById('vehicleQty').value) || 0;
    const petQty = parseInt(document.getElementById('petQty').value) || 0;
    const totalTags = vehicleQty + petQty;

    let freeDeliveries = 0;
    if (totalTags >= 5) freeDeliveries = 2;
    else if (totalTags >= 3) freeDeliveries = 1;

    const paidDeliveries = Math.max(0, totalTags - freeDeliveries);
    const totalCost = paidDeliveries * 149; // ₹149 per tag delivery
    const savings = freeDeliveries * 149;

    document.getElementById('totalTagsDisplay').innerText = totalTags;
    document.getElementById('costDisplay').innerText = `₹${totalCost}`;

    if (savings > 0) {
        document.getElementById('savingsDisplay').innerText = `(You saved ₹${savings}!)`;
    } else {
        document.getElementById('savingsDisplay').innerText = '';
    }
}

// 2. Submit order to backend
async function placeOrder() {
    const data = {
        vehicleQty: parseInt(document.getElementById('vehicleQty').value) || 0,
        petQty: parseInt(document.getElementById('petQty').value) || 0,
        address: document.getElementById('address').value,
        city: document.getElementById('city').value,
        state: document.getElementById('state').value,
        pincode: document.getElementById('pincode').value
    };

    if (data.vehicleQty + data.petQty === 0) {
        return alert("Please add at least 1 tag.");
    }
    if (!data.address || !data.city || !data.pincode) {
        return alert("Please fill in your complete shipping address.");
    }

    try {
        const response = await fetch('/api/orders/place', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Assuming you use JWT tokens for login:
                'Authorization': `Bearer ${localStorage.getItem('token')}` 
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            alert("Order placed successfully! Your tags have been added to your dashboard.");
            window.location.reload(); // Refresh to show new tags
        } else {
            alert("Error: " + result.error);
        }
    } catch (error) {
        console.error("Order failed:", error);
        alert("Something went wrong. Please check your backend terminal for errors.");
    }
}
