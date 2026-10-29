export enum UserRole {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  EMPLOYEE = 'EMPLOYEE',
}

export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  LOCKED = 'LOCKED',
}

export enum EmployeeStatus {
  ACTIVE = 'ACTIVE',
  /** Tạm ngưng công tác — vẫn còn trong hệ thống, không tính đang làm việc */
  SUSPENDED = 'SUSPENDED',
  INACTIVE = 'INACTIVE',
}

export enum EmployeeGender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
}

export enum ContractType {
  PROBATION = 'PROBATION',
  OFFICIAL = 'OFFICIAL',
  INDEFINITE = 'INDEFINITE',
  INTERN = 'INTERN',
}

export enum DepartmentStatus {
  ACTIVE = 'ACTIVE',
  /** Bản nháp — chưa đưa vào vận hành */
  DRAFT = 'DRAFT',
  INACTIVE = 'INACTIVE',
}

export enum TaskPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum TaskStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  REVIEW = 'REVIEW',
  DONE = 'DONE',
}

export enum AttendanceStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

export enum LeaveStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export enum LeaveType {
  ANNUAL = 'ANNUAL',
  SICK = 'SICK',
  UNPAID = 'UNPAID',
  OTHER = 'OTHER',
}
