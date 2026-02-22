
// Global API URL (Change to your live server)
const API_URL = 'http://localhost:3000/api';

// 1. Search Plate & Call
async function searchAndCall() {
    const plate = document.getElementById('plateInput').value.toUpperCase();
    const resultBox = document.getElementById('searchResult');

    if (plate.length < 4) {
        alert("Please enter a valid number plate");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/search/plate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plateNumber: plate })
        });

        const data = await response.json();

        if (data.found) {
            if (data.contactable) {
                // Open Modal to get Caller Number
                window.currentTagCode = data.tagCode; // Store temporarily
                document.getElementById('callModal').style.display = 'flex';
                resultBox.innerText = "";
            } else {
                resultBox.innerText = "❌ Owner has turned OFF calls currently.";
                resultBox.style.color = "#ef4444";
            }
        } else {
            resultBox.innerText = "⚠️ Vehicle not registered with ContactKar.";
            resultBox.style.color = "#f59e0b";
        }
    } catch (error) {
        console.error(error);
        alert("Error searching plate");
    }
}

// 2. Initiate the Bridge Call
async function initiateCall() {
    const callerNum = document.getElementById('callerNumber').value;
    if (callerNum.length < 10) {
        alert("Invalid phone number");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/contact/call-bridge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                tagCode: window.currentTagCode,
                callerNumber: callerNum
            })
        });

        const data = await response.json();
        if (data.success) {
            alert("✅ Call Initiated! You will receive a call on your phone shortly connecting you to the owner.");
            document.getElementById('callModal').style.display = 'none';
        } else {
            alert("Failed to connect call.");
        }
    } catch (error) {
        alert("Server error");
    }
}

// 3. Toggle Privacy (Dashboard)
async function toggleTagPrivacy(tagId, status) {
    try {
        // Assume we have a token stored
        const token = localStorage.getItem('token'); 

        const response = await fetch(`${API_URL}/tags/${tagId}/toggle`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ isContactable: status })
        });

        const data = await response.json();
        if(data.success) {
            console.log("Privacy updated");
        } else {
            alert("Failed to update status");
            // Revert toggle visually if failed (logic needed)
        }
    } catch (error) {
        console.error("API Error", error);
    }
}

// 4. Buy Tag Logic
function buyTag(type) {
    // Redirect to payment/register
    window.location.href = `register.html?type=${type}`;
}
