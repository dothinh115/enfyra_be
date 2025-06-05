import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { User_definition } from "./user_definition.entity";

@Entity('role_definition')
export class Role_definition {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: "varchar", nullable: false })
  name: string;

  @OneToMany(() => User_definition, rel => rel.role, { cascade: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  users: User_definition[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
