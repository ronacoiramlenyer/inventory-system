# Equipment Instances Implementation Guide

## Overview
The system has been redesigned to support tracking individual equipment units separately, enabling proper management of multiple physical units per equipment type on the F-LAB-001 Equipment Monitoring Record.

## Architecture

### Data Model
```
Items (inventory items)
└── category = "Equipment"
    └── Equipment Instances (individual physical units)
        ├── serial_number (unique per item)
        ├── location
        ├── status (Active, In Storage, Retired, Under Repair)
        └── Equipment Logs (maintenance records)
            ├── entry_date
            ├── service_performed (Preventive, Repair, Calibration)
            ├── request_id (reference to EWR)
            ├── status
            └── logged_by
```

### Database Tables
- `items` - Equipment type/description (unchanged)
- `equipment_instances` (NEW) - Individual tracked units
  - `id` (PRIMARY KEY)
  - `item_id` (FOREIGN KEY → items)
  - `serial_number` (TEXT, UNIQUE with item_id)
  - `location` (TEXT, nullable)
  - `status` (TEXT, nullable)
  - `created_at` (timestamp)

- `equipment_logs` - Maintenance records (MODIFIED)
  - `equipment_instance_id` (NEW FOREIGN KEY → equipment_instances)
  - `equipment_id` (OLD FK, deprecated but kept for compatibility)

## API Endpoints

### Equipment Instances Management
```
POST   /api/equipment-instances/bulk
  Create multiple instances at once
  Body: {
    item_id: number,
    instances: [
      { serial_number: "SN-001", location: "Lab A", status: "Active" },
      { serial_number: "SN-002", location: "Lab B" }
    ]
  }
  Returns: Array of created instances

GET    /api/equipment-instances/item/:itemId
  List all instances for an item
  Returns: Array of instances with full details

POST   /api/equipment-instances
  Create single instance
  Body: { item_id, serial_number, location, status }
  Returns: Created instance

GET    /api/equipment-instances/:id
  Get single instance details
  Returns: Instance with item metadata

PUT    /api/equipment-instances/:id
  Update instance (serial_number, location, status)

DELETE /api/equipment-instances/:id
  Remove instance
```

### Equipment Logs for Instances
```
GET    /api/equipment-instances/:id/logs
  Get all logs for an instance
  Returns: Array of logs sorted by entry_date

POST   /api/equipment-instances/:id/logs
  Create maintenance log for instance
  Body: {
    entry_date,
    service_performed,
    request_id,
    status,
    logged_by
  }
  Returns: Created log

DELETE /api/equipment-instances/:id/logs/:logId
  Remove log entry
```

## Frontend Components

### Updated: EquipmentMonitoringRecord.jsx
Enhanced page that:
- Loads all equipment instances for an item
- Provides dropdown selector for choosing which unit to view
- Displays selected unit's serial number and location
- Shows/manages logs for the selected instance
- Supports printing individual units

**Key Changes:**
- Line 51: Load instances with `api.get('/equipment-instances/item/:id')`
- Line 61: Track `selectedInstanceId` state
- Line 108: Show instance selector dropdown
- Line 155: Fetch logs from `/equipment-instances/:id/logs`

### New: EquipmentInstancesManager.jsx
Component for bulk creating equipment units:
- Display list of existing instances for an item
- Form to add multiple units with serial numbers
- Bulk create via POST /api/equipment-instances/bulk
- Delete individual units
- Track instance count

## Usage Workflows

### 1. Equipment Receipt Workflow
**When receiving new equipment:**

```
Stock Card View
  ↓
Item: "Air Purifier UV Care" (qty: 5)
  ↓
[+Add Units] button opens EquipmentInstancesManager
  ↓
Staff enters 5 serial numbers + locations:
  - SN-123456, Lab 201
  - SN-asd, Lab 202
  - SN-gfdg, Lab 203
  - etc.
  ↓
POST /api/equipment-instances/bulk
  ↓
5 instances created and linked to item
```

### 2. EMR (F-LAB-001) Workflow
**When recording maintenance:**

```
EMR Page: /items/:id/equipment-monitoring-record
  ↓
GET /equipment-instances/item/:id
  ↓
Dropdown shows all 5 units:
  "SN: 123456 • Location: Lab 201 • Status: Active"
  ↓
Select unit
  ↓
GET /equipment-instances/:instanceId/logs
  ↓
Show logs table for selected unit
  ↓
[+Add Entry] → POST /equipment-instances/:instanceId/logs
  ↓
Log recorded for specific unit
```

### 3. Equipment Management Workflow
**Tracking individual unit status:**

```
Equipment Instance Details
  ↓
View/edit:
  - Serial Number
  - Location
  - Status (Active/In Storage/Retired/Under Repair)
  ↓
PUT /api/equipment-instances/:id
  ↓
Instance updated
```

## Integration Points

### 1. Stock Card Page
- Add EquipmentInstancesManager component for Equipment category items
- Show: "Equipment Units (5)" section
- Allow: Add/manage units when inventory increases
- Display: List of units with serial numbers

**Location:** `/client/src/pages/StockCard.jsx` or `/pages/ItemDetail.jsx`

```jsx
{item.category === 'Equipment' && (
  <EquipmentInstancesManager 
    itemId={item.id}
    itemName={item.item_name}
    quantity={item.initial_balance}
    onInstancesCreated={handleInstancesCreated}
  />
)}
```

### 2. Inventory Count (F-LAB-010)
- When recording inventory counts for Equipment items
- Should count individual instances against recorded serial numbers
- Future: Match physical counts to instance list

### 3. Work Request System (F-LAB-004)
- When creating work request with equipment_item_id
- Show dropdown of available instances for that item
- Link request to specific equipment_instance_id
- Prevent logging to same instance twice

### 4. Maintenance Schedule (F-LAB-002/003)
- When completing scheduled maintenance
- Link to equipment_instance_id
- Auto-create equipment log for that instance

## Migration Path

### For Existing Equipment Items
If you have equipment items without instances:

**Option 1: Manual Creation**
- Visit each equipment item's page
- Use EquipmentInstancesManager to add instances
- Enter serial numbers from existing documentation

**Option 2: Bulk Migration Script**
```javascript
// Pseudo-code for migration
const items = await getEquipmentItems();
for (const item of items) {
  if (item.serial_number) {
    // Create instance from item's serial_number field
    await createInstance({
      item_id: item.id,
      serial_number: item.serial_number,
      location: item.location
    });
  }
}
```

### For Existing Equipment Logs
If you have logs referencing `equipment_id`:
- They remain readable via backward compatibility
- New logs use `equipment_instance_id`
- Consider migrating old logs to instances
- Suggest: Map to first/primary instance if unknown

## Status Indicators

### Equipment Instance Status Values
- **Active** - In normal use
- **In Storage** - Currently stored, not in use
- **Under Repair** - Currently being serviced
- **Retired** - No longer tracked
- **Loaned** - Temporarily loaned out
- **Decommissioned** - Removed from inventory

## Printing (F-LAB-001)

### Single Unit Print
```
Equipment Name: Air Purifier UV Care
Serial Number: SN-123456
Location: Lab Room 201
[Table of logs for this unit only]
```

### All Units Print
TBD - Design needed for printing multiple units in one document

## Completed Implementation

### API Endpoints ✓
- [x] POST /api/equipment-instances/bulk - Create 5 instances
- [x] GET /api/equipment-instances/item/:id - List returns 5 instances
- [x] POST /api/equipment-instances/:id/logs - Add log to instance
- [x] GET /api/equipment-instances/:id/logs - Retrieve logs for instance
- [x] DELETE /api/equipment-instances/:id - Remove instance
- [x] PUT /api/equipment-instances/:id - Update instance
- [x] GET /api/equipment-instances/migration-status - Check orphaned logs
- [x] POST /api/equipment-instances/:instanceId/adopt-logs/:itemId - Auto-migrate logs

### Frontend Components ✓
- [x] EquipmentMonitoringRecord.jsx - Updated to show instance selector
- [x] EquipmentInstancesManager.jsx - Bulk create and manage instances with status
- [x] EquipmentLogsMigrationHelper.jsx - Migrate existing logs to instances
- [x] Stock Card integration - EquipmentInstancesManager visible for Equipment items

### Workflows ✓
- [x] Receive 5 equipment units → Create 5 instances in Stock Card
- [x] Record maintenance → Log appears for correct unit only in EMR
- [x] Delete unit → Logs preserved
- [x] Update unit status → Reflected in EMR page and instances list
- [x] Migrate existing logs → Auto-link to instances via migration helper
- [x] Click status badge → Edit status inline

## Testing Checklist (in progress)

### API Endpoints
- [ ] POST /api/equipment-instances/bulk - Create 5 instances
- [ ] GET /api/equipment-instances/item/:id - List returns 5 instances
- [ ] POST /api/equipment-instances/:id/logs - Add log to instance
- [ ] GET /api/equipment-instances/:id/logs - Retrieve logs for instance
- [ ] DELETE /api/equipment-instances/:id - Remove instance
- [ ] PUT /api/equipment-instances/:id - Update instance
- [ ] POST /api/equipment-instances/:instanceId/adopt-logs/:itemId - Migrate logs

### Frontend Pages
- [ ] Stock Card page displays EquipmentInstancesManager for Equipment items
- [ ] EMR page loads without errors
- [ ] Dropdown shows all instances for an item
- [ ] Selecting instance loads correct logs
- [ ] Adding log creates entry for selected instance
- [ ] Status badges are clickable and editable
- [ ] Migration helper appears when logs exist
- [ ] Printing works correctly for EMR
- [ ] EquipmentInstancesManager creates multiple units

### Workflows
- [ ] Receive 5 equipment units → Create 5 instances in Stock Card
- [ ] Record maintenance → Log appears for correct unit only
- [ ] Delete unit → Unit removed, logs preserved
- [ ] Update unit status → Reflected in EMR page immediately
- [ ] Migrate existing logs → Helper successfully links logs to instance

## Remaining Integrations

### Work Request System (F-LAB-004) - TODO
When work request system is ready to integrate:

```javascript
// Work request table needs:
// - equipment_instance_id (FK → equipment_instances)
// - Keep equipment_item_id for reference to item type

// WorkRequest form changes:
// 1. When equipment_item_id selected, load instances via GET /equipment-instances/item/:id
// 2. Show instance dropdown: "SN: 123 • Location: Lab A • Status: Active"
// 3. Store equipment_instance_id in request
// 4. Prevent duplicate requests to same instance (check existing requests)
// 5. Display instance details in request view

// WorkRequestDetail.jsx updates:
// - Show "Requesting maintenance for: [Item Name] - Serial #[SN]"
// - When work is completed, optionally auto-create equipment_log entry
```

### Maintenance Schedule Integration (F-LAB-002/003) - TODO
- Link scheduled maintenance entries to specific equipment instances
- When completing scheduled maintenance, show instance selector
- Auto-create equipment_log for the selected instance

## Future Enhancements

1. **Batch Operations**
   - Update status for multiple instances at once
   - Bulk assign location

2. **Instance History**
   - Track location changes over time
   - Status change audit trail

3. **Equipment Disposal**
   - Workflow to decommission units
   - Document why/when unit was removed

4. **QR Code Labels**
   - Generate QR codes for each instance's detail page
   - Print labels for physical equipment

5. **Asset Tracking**
   - Geolocation history
   - Cross-lab equipment sharing

6. **Multi-Unit Printing**
   - Design for printing all units in one document
   - Batch EMR export

## Support

For questions or issues with equipment instances:
1. Check API response for specific error messages
2. Verify equipment item category is "Equipment"
3. Ensure unique serial numbers per item
4. Check authorization - staff can only access own department items
