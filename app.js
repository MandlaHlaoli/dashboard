// script.js
// __define-ocg__ Backendless Integration

const APP_ID = "FCA60924-A426-4B41-B6B9-DB60AF33287C";
const API_KEY = "011F8756-377C-4166-BE02-A32428E90AE5";
Backendless.initApp(APP_ID, API_KEY);

let bedData = [];
let varOcg = []; // Original copy
let hasChanges = false; // Track unsaved edits

// Fetch all beds with pagination
async function fetchAllBeds() {
  const pageSize = 100; // max page size
  let offset = 0;
  let allRows = [];

  while (true) {
    const page = await Backendless.Data.of("Beds").find({ pageSize, offset });
    allRows = allRows.concat(page);

    if (page.length < pageSize) break; // last page reached
    offset += pageSize;
  }

  return allRows;
}

// Fetch bed data from Backendless
async function fetchBedData() {
  try {
    bedData = await fetchAllBeds();
    varOcg = JSON.parse(JSON.stringify(bedData)); // Deep copy
    populateWardFilter();
    renderTable();
    updateSaveButton();
  } catch (error) {
    console.error("Error fetching data:", error);
  }
}

// Determine CSS class for status
function getStatusClass(status) {
  if (!status) return "";
  if (status.includes("Overcapacity") || status.includes("Invalid"))
    return "status-over";
  if (status.includes("Full")) return "status-full";
  return "status-ok";
}

// Compute bed status
function computeStatus(row) {
  const assess = Number(row.beds_assess);
  const occupied = Number(row.occupied_beds);
  const discharge = Number(row.discharge_pending);

  if (occupied + discharge > assess) return "Overcapacity";
  if (occupied === assess) return "Full";
  return "Available";
}

// Populate ward filter dropdown
function populateWardFilter() {
  const wards = [...new Set(bedData.map((row) => row.ward_name))];
  const select = document.getElementById("wardFilter");
  select.innerHTML = `<option value="All">All</option>`;
  wards.forEach((ward) => {
    const option = document.createElement("option");
    option.value = ward;
    option.textContent = ward;
    select.appendChild(option);
  });
  select.addEventListener("change", renderTable);
}

// Render ward summary stats
function renderWardSummary(filteredRows) {
  const summaryDiv = document.getElementById("wardSummary");
  if (!filteredRows.length) {
    summaryDiv.innerHTML = `<p>No data available for this ward.</p>`;
    return;
  }

  const totalBeds = filteredRows.reduce(
    (sum, r) => sum + Number(r.beds_assess),
    0
  );
  const totalOccupied = filteredRows.reduce(
    (sum, r) => sum + Number(r.occupied_beds),
    0
  );
  const totalDischarge = filteredRows.reduce(
    (sum, r) => sum + Number(r.discharge_pending),
    0
  );
  const totalFree = filteredRows.reduce(
    (sum, r) => sum + Number(r.free_beds ?? 0),
    0
  );

  const pctFree = ((totalFree / totalBeds) * 100).toFixed(1);
  const pctOccupied = ((totalOccupied / totalBeds) * 100).toFixed(1);
  const pctDischarge = ((totalDischarge / totalBeds) * 100).toFixed(1);

  summaryDiv.innerHTML = `
    <h3>Ward Summary</h3>
    <p>Total Beds: <b>${totalBeds}</b></p>
    <div style="display:flex; gap:20px; margin-top:8px;">
      <div>🟩 Free: ${pctFree}%</div>
      <div>🟥 Occupied: ${pctOccupied}%</div>
      <div>🟨 Pending Discharge: ${pctDischarge}%</div>
    </div>
    <div style="margin-top:8px; background:#eee; height:20px; border-radius:5px; overflow:hidden;">
      <div style="width:${pctOccupied}%; background:#e74c3c; float:left; height:100%"></div>
      <div style="width:${pctDischarge}%; background:#f1c40f; float:left; height:100%"></div>
      <div style="width:${pctFree}%; background:#2ecc71; float:left; height:100%"></div>
    </div>
  `;
}

// Render the main table
function renderTable() {
  const tbody = document.querySelector("#bedTable tbody");
  tbody.innerHTML = "";

  const selectedWard = document.getElementById("wardFilter").value;
  document.getElementById("wardHeading").textContent = `Ward: ${selectedWard}`;

  // Filter rows by ward
  let filteredRows = bedData.filter(
    (row) => selectedWard === "All" || row.ward_name === selectedWard
  );

  // Sort by ward then room_no (numeric)
  filteredRows.sort((a, b) => {
    if (a.ward_name < b.ward_name) return -1;
    if (a.ward_name > b.ward_name) return 1;
    // If same ward, sort by room_no numerically
    return Number(a.room_no) - Number(b.room_no);
  });

  renderWardSummary(filteredRows);

  filteredRows.forEach((row, index) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.ward_name}</td>
      <td>${row.room_no}</td>
      <td>${row.beds_clinicom}</td>
      <td>${row.beds_assess}</td>
      <td class="editable" contenteditable="true" data-field="occupied_beds" data-index="${index}">${
      row.occupied_beds
    }</td>
      <td class="editable" contenteditable="true" data-field="discharge_pending" data-index="${index}">${
      row.discharge_pending
    }</td>
      <td class="freeBeds">${row.free_beds ?? 0}</td>
      <td class="status ${getStatusClass(row.status)}">${
      row.status ?? "N/A"
    }</td>
    `;
    tbody.appendChild(tr);
  });

  addEditListeners();
}

// Enable editing & validation
function addEditListeners() {
  document.querySelectorAll("td[contenteditable=true]").forEach((cell) => {
    cell.addEventListener("input", () => {
      const value = cell.textContent.trim();
      if (!/^\d*$/.test(value)) {
        cell.textContent = value.replace(/\D/g, "");
      }
    });

    cell.addEventListener("blur", () => {
      const index = cell.dataset.index;
      const field = cell.dataset.field;
      const value = parseInt(cell.textContent.trim(), 10);

      if (isNaN(value)) {
        cell.textContent = bedData[index][field];
        return;
      }

      const row = bedData[index];
      const assess = Number(row.beds_assess);
      let occupied = Number(row.occupied_beds);
      let discharge = Number(row.discharge_pending);

      if (field === "occupied_beds") {
        if (value > assess) {
          alert("Occupied Beds cannot exceed Beds (Assess).");
          cell.textContent = occupied;
          return;
        }
        occupied = value;
      }

      if (field === "discharge_pending") {
        if (value > assess) {
          alert("Discharge Pending cannot exceed Beds (Assess).");
          cell.textContent = discharge;
          return;
        }
        discharge = value;
      }

      if (occupied + discharge > assess) {
        alert("Occupied + Discharge cannot exceed Beds (Assess).");
        cell.textContent = row[field];
        return;
      }

      // ✅ Update locally
      row[field] = value;
      row.occupied_beds = occupied;
      row.discharge_pending = discharge;
      row.free_beds = assess - (occupied + discharge);
      row.status = computeStatus(row);

      // ✅ Update UI
      const tr = cell.parentElement;
      tr.querySelector(".freeBeds").textContent = row.free_beds;
      const statusCell = tr.querySelector(".status");
      statusCell.textContent = row.status;
      statusCell.className = "status " + getStatusClass(row.status);

      markChanges();

      // ✅ Update ward summary live
      const selectedWard = document.getElementById("wardFilter").value;
      const filteredRows = bedData.filter(
        (r) => selectedWard === "All" || r.ward_name === selectedWard
      );
      renderWardSummary(filteredRows);
    });
  });
}

// Mark changes for save
function markChanges() {
  hasChanges = true;
  updateSaveButton();
}

// Enable or disable Save button
function updateSaveButton() {
  const btn = document.getElementById("saveBtn");
  if (hasChanges) {
    btn.disabled = false;
    btn.classList.add("active");
  } else {
    btn.disabled = true;
    btn.classList.remove("active");
  }
}

// Save all changes to Backendless
async function saveChanges() {
  const loader = document.getElementById("loaderOverlay");
  loader.style.display = "flex"; // Show loader overlay

  try {
    for (let row of bedData) {
      await Backendless.Data.of("Beds").save(row);
    }
    console.log("All changes saved.");
    hasChanges = false;
    updateSaveButton();
    await fetchBedData(); // Reload latest data
  } catch (error) {
    console.error("Error saving changes:", error);
    alert("Failed to save changes. Please try again.");
  } finally {
    loader.style.display = "none"; // Hide loader overlay
  }
}

// Start app
fetchBedData();
