import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { Role_definition } from "./role_definition.entity";

@Entity('user_definition')
export class User_definition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: "varchar", nullable: false })
  email: string;

  @Column({ type: "boolean", nullable: false, default: false })
  isRootUser: boolean;

  @Column({ type: "varchar", nullable: false })
  password: string;

  @ManyToOne(() => Role_definition, rel => rel.users, { nullable: true, cascade: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn()
  role: Role_definition;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
