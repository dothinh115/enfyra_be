import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, JoinTable, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { HiddenField } from "../decorators/hidden-field.decorator";
import { Role_definition } from "./role_definition.entity";

@Entity('user_definition')
export class User_definition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: "varchar", nullable: false })
  email: string;

  @Column({ type: "boolean", nullable: false, default: false })
  isRootAdmin: boolean;

  @Column({ type: "varchar", nullable: false })
  @HiddenField()
  password: string;

  @ManyToMany(() => Role_definition, rel => rel.users, { nullable: true, cascade: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinTable()
  roles: Role_definition[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
