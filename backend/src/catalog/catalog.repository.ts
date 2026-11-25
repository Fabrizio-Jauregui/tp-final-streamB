import { randomUUID } from 'node:crypto';
import { Pool, type QueryResultRow } from 'pg';
import type { AuthDatabase } from '../auth/auth.types.ts';
import type {
  AssetUnitRecord,
  AssetUnitStatus,
  CatalogRepository,
  EquipmentTypeRecord,
  UpdateAssetUnitStatusResult,
  UnitFilters,
} from './catalog.service.ts';

interface EquipmentTypeRow extends QueryResultRow {
  id: string;
  name: string;
  description: string;
  hourly_rate_ars: string | null;
  is_active: boolean;
  created_at: Date;
}

interface AssetUnitRow extends QueryResultRow {
  id: string;
  equipment_type_id: string;
  equipment_type_name: string;
  code: string;
  status: AssetUnitStatus;
  created_at: Date;
}

function mapEquipmentType(row: EquipmentTypeRow): EquipmentTypeRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    hourlyRate: row.hourly_rate_ars,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

function mapAssetUnit(row: AssetUnitRow): AssetUnitRecord {
  return {
    id: row.id,
    equipmentTypeId: row.equipment_type_id,
    equipmentTypeName: row.equipment_type_name,
    code: row.code,
    status: row.status,
    createdAt: row.created_at,
  };
}

const equipmentTypeColumns = `id, name, description, hourly_rate_ars, is_active, created_at`;
const assetUnitColumns = `u.id, u.equipment_type_id, t.name AS equipment_type_name, u.code, u.status, u.created_at`;

export class PostgresCatalogRepository implements CatalogRepository {
  private readonly database: AuthDatabase;

  constructor(database: AuthDatabase) {
    this.database = database;
  }

  async listEquipmentTypes(activeOnly: boolean): Promise<EquipmentTypeRecord[]> {
    const result = await this.database.query<EquipmentTypeRow>(
      `SELECT ${equipmentTypeColumns}
       FROM equipment_types
       ${activeOnly ? 'WHERE is_active = TRUE' : ''}
       ORDER BY name, id`,
    );
    return result.rows.map(mapEquipmentType);
  }

  async findEquipmentTypeById(id: string): Promise<EquipmentTypeRecord | null> {
    const result = await this.database.query<EquipmentTypeRow>(
      `SELECT ${equipmentTypeColumns} FROM equipment_types WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? mapEquipmentType(result.rows[0]) : null;
  }

  async insertEquipmentType(
    input: Omit<EquipmentTypeRecord, 'id' | 'createdAt'>,
    createdAt: Date,
  ): Promise<EquipmentTypeRecord> {
    const result = await this.database.query<EquipmentTypeRow>(
      `INSERT INTO equipment_types
        (id, name, description, hourly_rate_ars, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${equipmentTypeColumns}`,
      [randomUUID(), input.name, input.description, input.hourlyRate, input.isActive, createdAt],
    );
    return mapEquipmentType(result.rows[0]!);
  }

  async updateEquipmentType(
    id: string,
    changes: Partial<Omit<EquipmentTypeRecord, 'id' | 'createdAt'>>,
  ): Promise<EquipmentTypeRecord | null> {
    const columns: Array<[keyof typeof changes, string]> = [
      ['name', 'name'],
      ['description', 'description'],
      ['hourlyRate', 'hourly_rate_ars'],
      ['isActive', 'is_active'],
    ];
    const assignments: string[] = [];
    const values: unknown[] = [id];
    for (const [property, column] of columns) {
      if (!(property in changes)) continue;
      values.push(changes[property]);
      assignments.push(`${column} = $${values.length}`);
    }
    if (assignments.length === 0) return this.findEquipmentTypeById(id);

    const result = await this.database.query<EquipmentTypeRow>(
      `UPDATE equipment_types SET ${assignments.join(', ')} WHERE id = $1
       RETURNING ${equipmentTypeColumns}`,
      values,
    );
    return result.rows[0] ? mapEquipmentType(result.rows[0]) : null;
  }

  async listAssetUnits(filters: UnitFilters): Promise<AssetUnitRecord[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (filters.equipmentTypeId !== undefined) {
      values.push(filters.equipmentTypeId);
      conditions.push(`u.equipment_type_id = $${values.length}`);
    }
    if (filters.status !== undefined) {
      values.push(filters.status);
      conditions.push(`u.status = $${values.length}::asset_status`);
    }
    const result = await this.database.query<AssetUnitRow>(
      `SELECT ${assetUnitColumns}
       FROM asset_units u
       JOIN equipment_types t ON t.id = u.equipment_type_id
       ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
       ORDER BY t.name, u.code, u.id`,
      values,
    );
    return result.rows.map(mapAssetUnit);
  }

  async findAssetUnitById(id: string): Promise<AssetUnitRecord | null> {
    const result = await this.database.query<AssetUnitRow>(
      `SELECT ${assetUnitColumns}
       FROM asset_units u
       JOIN equipment_types t ON t.id = u.equipment_type_id
       WHERE u.id = $1`,
      [id],
    );
    return result.rows[0] ? mapAssetUnit(result.rows[0]) : null;
  }

  async insertAssetUnit(
    input: Omit<AssetUnitRecord, 'id' | 'equipmentTypeName' | 'createdAt'>,
    createdAt: Date,
  ): Promise<AssetUnitRecord> {
    const result = await this.database.query<AssetUnitRow>(
      `INSERT INTO asset_units (id, equipment_type_id, code, status, created_at)
       VALUES ($1, $2, $3, $4::asset_status, $5)
       RETURNING id, equipment_type_id, code, status, created_at,
         (SELECT name FROM equipment_types WHERE id = asset_units.equipment_type_id) AS equipment_type_name`,
      [randomUUID(), input.equipmentTypeId, input.code, input.status, createdAt],
    );
    return mapAssetUnit(result.rows[0]!);
  }

  async updateAssetUnitStatus(id: string, status: AssetUnitStatus): Promise<UpdateAssetUnitStatusResult> {
    let transactionDatabase = this.database;
    let release: (() => void) | undefined;
    if (this.database instanceof Pool) {
      const connection = await this.database.connect();
      transactionDatabase = connection;
      release = () => connection.release();
    }

    try {
      await transactionDatabase.query('BEGIN');
      try {
        const current = await transactionDatabase.query<AssetUnitRow>(
          `SELECT ${assetUnitColumns}
           FROM asset_units u
           JOIN equipment_types t ON t.id = u.equipment_type_id
           WHERE u.id = $1
           FOR UPDATE OF u`,
          [id],
        );
        if (!current.rows[0]) {
          await transactionDatabase.query('COMMIT');
          return { kind: 'not_found' };
        }

        const custody = await transactionDatabase.query<{ exists: boolean } & QueryResultRow>(
          `SELECT EXISTS (
             SELECT 1 FROM reservation_allocations
             WHERE asset_unit_id = $1 AND picked_up_at IS NOT NULL AND custody_ended_at IS NULL
           ) AS exists`,
          [id],
        );
        if (custody.rows[0]?.exists) {
          await transactionDatabase.query('COMMIT');
          return { kind: 'unit_in_custody' };
        }

        const updated = await transactionDatabase.query<AssetUnitRow>(
          `UPDATE asset_units u
           SET status = $2::asset_status
           FROM equipment_types t
           WHERE u.id = $1 AND t.id = u.equipment_type_id
           RETURNING u.id, u.equipment_type_id, t.name AS equipment_type_name, u.code, u.status, u.created_at`,
          [id, status],
        );
        await transactionDatabase.query('COMMIT');
        return { kind: 'updated', unit: mapAssetUnit(updated.rows[0]!) };
      } catch (error) {
        try {
          await transactionDatabase.query('ROLLBACK');
        } catch {
          // Keep the original database error; the connection is released below.
        }
        throw error;
      }
    } finally {
      release?.();
    }
  }
}
